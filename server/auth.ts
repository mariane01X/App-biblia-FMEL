import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(senha: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(senha, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable must be set");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      {
        usernameField: 'nomeUsuario',
        passwordField: 'senha'
      },
      async (nomeUsuario, senha, done) => {
        try {
          console.log(`Tentativa de login para usuário: ${nomeUsuario}`);
          const user = await storage.getUserByUsername(nomeUsuario);

          if (!user) {
            console.log(`Usuário não encontrado: ${nomeUsuario}`);
            return done(null, false, { message: "Usuário não encontrado" });
          }

          const isValid = await comparePasswords(senha, user.senha);
          if (!isValid) {
            console.log(`Senha inválida para usuário: ${nomeUsuario}`);
            return done(null, false, { message: "Senha incorreta" });
          }

          console.log(`Login bem-sucedido para usuário: ${nomeUsuario}`);
          return done(null, user);
        } catch (err) {
          console.error("Erro durante autenticação:", err);
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    console.log(`Serializando usuário: ${user.id}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      console.log(`Tentando deserializar usuário: ${id}`);
      const user = await storage.getUser(id);

      if (!user) {
        console.log(`Usuário não encontrado durante deserialização: ${id}`);
        return done(null, false);
      }

      console.log(`Usuário deserializado com sucesso: ${id}`);
      done(null, user);
    } catch (err) {
      console.error("Erro durante deserialização:", err);
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.nomeUsuario);
      if (existingUser) {
        return res.status(400).send("Nome de usuário já existe");
      }

      const user = await storage.createUser({
        ...req.body,
        senha: await hashPassword(req.body.senha),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Falha na autenticação" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    console.log(`Logout iniciado para usuário: ${userId}`);

    req.logout((err) => {
      if (err) {
        console.error(`Erro durante logout para usuário ${userId}:`, err);
        return next(err);
      }
      console.log(`Logout bem-sucedido para usuário: ${userId}`);
      req.session.destroy((err) => {
        if (err) {
          console.error(`Erro ao destruir sessão para usuário ${userId}:`, err);
          return next(err);
        }
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Tentativa de acesso não autenticada a /api/user");
      return res.sendStatus(401);
    }
    console.log(`Dados do usuário retornados: ${req.user.id}`);
    res.json(req.user);
  });
}