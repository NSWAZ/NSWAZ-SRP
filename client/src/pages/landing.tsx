import { useState, useEffect } from "react";
import { AlertCircle, FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import backgroundImage from "@assets/Nag1_1766304787177.png";

const DEV_TEST_CHARACTERS = {
  admin: { id: 96386549, name: "Admin" },
  fc: { id: 94403590, name: "FC" },
  member: { id: 2118572169, name: "Member" },
} as const;

export default function Landing() {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [devDialogOpen, setDevDialogOpen] = useState(false);
  const isDev = import.meta.env.DEV;

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
              <Alert variant="destructive" className="text-left bg-destructive/90 text-foreground" data-testid="alert-login-error">
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
              <Alert variant="destructive" className="text-left bg-destructive/90 text-foreground" data-testid="alert-auth-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>인증 실패</AlertTitle>
                <AlertDescription>
                  EVE SSO 인증 중 오류가 발생했습니다. 다시 시도해주세요.
                </AlertDescription>
              </Alert>
            )}

            {loginError === "unknown" && (
              <Alert variant="destructive" className="text-left bg-destructive/90 text-foreground" data-testid="alert-unknown-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>오류 발생</AlertTitle>
                <AlertDescription>
                  로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex flex-col items-center gap-4">
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

              {isDev && (
                <Dialog open={devDialogOpen} onOpenChange={setDevDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="gap-2 bg-yellow-500/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30"
                      data-testid="button-dev-login"
                    >
                      <FlaskConical className="h-4 w-4" />
                      Dev Login
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                      <DialogTitle>Select Test Role</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                      {(Object.keys(DEV_TEST_CHARACTERS) as Array<keyof typeof DEV_TEST_CHARACTERS>).map((role) => (
                        <Button
                          key={role}
                          variant="outline"
                          className="justify-start gap-2"
                          onClick={() => {
                            window.location.href = `/api/auth/dev-login?characterId=${DEV_TEST_CHARACTERS[role].id}`;
                          }}
                          data-testid={`button-dev-login-${role}`}
                        >
                          <img
                            src={`https://images.evetech.net/characters/${DEV_TEST_CHARACTERS[role].id}/portrait?size=32`}
                            alt={DEV_TEST_CHARACTERS[role].name}
                            className="h-6 w-6 rounded"
                          />
                          <span className="capitalize">{role}</span>
                        </Button>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
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
    </div>
  );
}
