import { useState, useEffect } from "react";
import { FlaskConical, User, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  role: "member" | "fc" | "admin";
  roleLabel: string;
}

const testCharacters: TestCharacter[] = [
  { characterId: 96386549, name: "Test Admin", role: "admin", roleLabel: "관리자" },
  { characterId: 95185257, name: "Test Member", role: "member", roleLabel: "멤버" },
];

export default function Landing() {
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    
    if (error === "seat_user_not_found") {
      setLoginError("seat_not_registered");
    } else if (error === "auth_failed") {
      setLoginError("auth_failed");
    } else if (error) {
      setLoginError("unknown");
    }

    // Clean URL after reading error
    if (error) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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

            {loginError === "seat_not_registered" && (
              <Alert variant="destructive" className="text-left bg-destructive/90" data-testid="alert-login-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>로그인 실패</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>SeAT에 등록되어 있지 않은 캐릭터입니다.</p>
                  <a
                    href="https://forums.nisuwaz.com/t/seat/224"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block underline font-medium hover:no-underline"
                    data-testid="link-seat-guide"
                  >
                    SeAT에 알트 추가하기
                  </a>
                </AlertDescription>
              </Alert>
            )}

            {loginError === "auth_failed" && (
              <Alert variant="destructive" className="text-left bg-destructive/90" data-testid="alert-auth-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>인증 실패</AlertTitle>
                <AlertDescription>
                  EVE SSO 인증 중 오류가 발생했습니다. 다시 시도해주세요.
                </AlertDescription>
              </Alert>
            )}

            {loginError === "unknown" && (
              <Alert variant="destructive" className="text-left bg-destructive/90" data-testid="alert-unknown-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>오류 발생</AlertTitle>
                <AlertDescription>
                  로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
                </AlertDescription>
              </Alert>
            )}
            
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
                <Badge variant={char.role === "admin" ? "destructive" : char.role === "fc" ? "default" : "secondary"}>
                  {char.role === "admin" ? (
                    <Shield className="mr-1 h-3 w-3" />
                  ) : char.role === "fc" ? (
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
