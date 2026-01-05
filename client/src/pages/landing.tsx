import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import backgroundImage from "@assets/Nag1_1766304787177.png";

export default function Landing() {
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
