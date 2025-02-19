import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Moon, Sun, User, QrCode } from "lucide-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function SettingsPage() {
  const { user } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Buscar o QR Code PIX
  const { data: qrCodeData } = useQuery({
    queryKey: ['/api/qrcode-pix'],
    enabled: true,
  });

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Configurações</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Dados Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Username</Label>
                <p className="text-muted-foreground">{user?.username}</p>
              </div>
              <div>
                <Label className="font-bold">Nova Criatura</Label>
                <div className="mt-2 space-y-2">
                  <div>
                    <Label>Idade quando aceitou Jesus</Label>
                    <Input 
                      value={user?.salvationAge || ''} 
                      onChange={(e) => {
                        // TODO: Implement update
                        console.log(e.target.value);
                      }} 
                    />
                  </div>
                  <div>
                    <Label>Data/Ano do Batismo</Label>
                    <Input 
                      value={user?.baptismDate || ''} 
                      onChange={(e) => {
                        // TODO: Implement update
                        console.log(e.target.value);
                      }} 
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isDarkMode ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
                Aparência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode">Modo Escuro</Label>
                <Switch
                  id="dark-mode"
                  checked={isDarkMode}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Doar via PIX
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {qrCodeData?.qrCodeUrl ? (
                <>
                  <img 
                    src={qrCodeData.qrCodeUrl} 
                    alt="QR Code PIX" 
                    className="w-48 h-48"
                  />
                  <p className="text-sm text-muted-foreground text-center">
                    Escaneie o código QR com seu aplicativo bancário para fazer uma doação
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Carregando QR Code PIX...
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}