import { useState } from "react";
import { FlaskConical, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import backgroundImage from "@assets/Nag1_1766304787177.png";

interface TestCharacter {
  characterId: number;
  name: string;
  role: "member" | "fc";
  roleLabel: string;
}

const testCharacters: TestCharacter[] = [
  { characterId: 96386549, name: "Test Member", role: "member", roleLabel: "멤버" },
  { characterId: 94403590, name: "Test FC", role: "fc", roleLabel: "FC" },
];

export default function Landing() {
  const [showCharacterModal, setShowCharacterModal] = useState(false);

  const { data: devModeData } = useQuery<{ isDevelopment: boolean }>({
    queryKey: ["/api/dev-mode"],
  });

  const isDevelopment = devModeData?.isDevelopment ?? false;
  
  const handleTestLogin = (characterId: number) => {
    window.location.href = `/api/test-login?characterId=${characterId}`;
  };

  return (
    <div className="relative min-h-screen bg-black">
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
        style={{
          backgroundImage: `url(${backgroundImage})`,
        }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="p-6">
          <div className="flex items-center gap-3">
            <img 
              src="https://images.evetech.net/alliances/99010412/logo?size=128" 
              alt="Nisuwa Cartel Logo"
              className="h-12 w-12"
            />
            <span className="text-xl font-light tracking-wide text-white/90" data-testid="text-logo">
              NISUWA CARTEL
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-md space-y-8 text-center">
            <h1 className="text-2xl font-light tracking-wider text-white/80" data-testid="text-hero-title">
              SRP Management System
            </h1>
            
            <div className="space-y-4">
              <a 
                href="/api/login" 
                className="inline-block transition-opacity hover:opacity-80"
                data-testid="button-login"
              >
                <img 
                  src="https://web.ccpgamescdn.com/eveonlineassets/developers/eve-sso-login-black-large.png" 
                  alt="Log in with EVE Online"
                  className="h-auto"
                />
              </a>

              {isDevelopment && (
                <Button 
                  size="lg"
                  variant="ghost"
                  className="w-full max-w-xs text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => setShowCharacterModal(true)}
                  data-testid="button-test-login"
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Test Login (Dev Mode)
                </Button>
              )}
            </div>
          </div>
        </main>

        <footer className="p-6 text-center">
          <p className="text-xs text-white/40" data-testid="text-footer">
            Nisuwa Cartel Alliance - SRP Management System
          </p>
        </footer>
      </div>

      <Dialog open={showCharacterModal} onOpenChange={setShowCharacterModal}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-test-login">
          <DialogHeader>
            <DialogTitle>테스트 캐릭터 선택</DialogTitle>
            <DialogDescription>
              로그인할 테스트 캐릭터를 선택하세요
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {testCharacters.map((char) => (
              <Button
                key={char.characterId}
                variant="outline"
                className="flex items-center justify-between gap-4 h-auto py-3"
                onClick={() => handleTestLogin(char.characterId)}
                data-testid={`button-login-${char.role}`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={`https://images.evetech.net/characters/${char.characterId}/portrait?size=64`}
                    alt={char.name}
                    className="h-10 w-10 rounded-full"
                  />
                  <span className="font-medium">{char.name}</span>
                </div>
                <Badge variant={char.role === "fc" ? "default" : "secondary"}>
                  {char.role === "fc" ? (
                    <Shield className="mr-1 h-3 w-3" />
                  ) : (
                    <User className="mr-1 h-3 w-3" />
                  )}
                  {char.roleLabel}
                </Badge>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
