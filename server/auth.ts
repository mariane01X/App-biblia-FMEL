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

const MASTER_USER = {
  id: "master-user",
  nomeUsuario: "Felipe Benchimol",
  senha: "130903",
  idadeConversao: "15",
  dataBatismo: "2018",
  isAdmin: true,
  profileType: "master",
  editCounter: 0,
  useTTS: false,
  lastLogin: new Date()
};

async function hashPassword(senha: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(senha, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  try {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error("Erro ao comparar senhas:", error);
    return false;
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
      async (nomeUsuario: string, senha: string, done: any) => {
        try {
          console.log(`Tentativa de login para usuário: ${nomeUsuario}`);

          if (nomeUsuario === MASTER_USER.nomeUsuario) {
            console.log("Verificando usuário master...");
            let masterUser = await storage.getUser(MASTER_USER.id);

            if (!masterUser) {
              console.log("Criando usuário master no banco de dados");
              const hashedPassword = await hashPassword(MASTER_USER.senha);
              masterUser = await storage.createUser({
                ...MASTER_USER,
                senha: hashedPassword
              });
              console.log("Usuário master criado com sucesso");
            }

            if (senha === MASTER_USER.senha) {
              console.log("Login do usuário master bem-sucedido");
              return done(null, masterUser);
            }

            console.log("Senha incorreta para usuário master");
            return done(null, false, { message: "Senha incorreta" });
          }

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
      console.log(`Desserializando usuário: ${id}`);
      if (id === MASTER_USER.id) {
        const masterUser = await storage.getUser(id);
        if (!masterUser) {
          return done(null, false);
        }
        return done(null, masterUser);
      }

      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (err) {
      console.error("Erro durante deserialização:", err);
      done(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message: string } | undefined) => {
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
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }
    res.json(req.user);
  });

  app.patch("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.sendStatus(401);
    }

    try {
      const { idadeConversao, dataBatismo, useTTS } = req.body;
      const updatedUser = await storage.updateUser(req.user.id, {
        idadeConversao,
        dataBatismo,
        useTTS: typeof useTTS === 'boolean' ? useTTS : undefined
      });
      res.json(updatedUser);
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error);
      res.status(500).json({ message: "Erro ao atualizar dados do usuário" });
    }
  });
}