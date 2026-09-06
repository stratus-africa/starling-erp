import { useState, useEffect } from "react";
import { usePlatformAuth } from "@/hooks/use-platform-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Loader2,
  LogOut,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

interface SupportSessionBannerProps {
  className?: string;
  showConsoleLink?: boolean;
}

export function SupportSessionBanner({
  className = "",
  showConsoleLink = true,
}: SupportSessionBannerProps) {
  const { supportSession, endSupportSession } = usePlatformAuth();
  const [isEnding, setIsEnding] = useState(false);
  const [minsRemaining, setMinsRemaining] = useState<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!supportSession) return;

    const calcMins = () => {
      const diffMs = new Date(supportSession.expiresAt).getTime() - Date.now();
      return Math.max(0, Math.round(diffMs / 60000));
    };

    setMinsRemaining(calcMins());

    const interval = setInterval(() => {
      setMinsRemaining(calcMins());
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [supportSession]);

  if (!supportSession) return null;

  const isCritical = minsRemaining <= 15;

  const handleExitSession = async () => {
    try {
      setIsEnding(true);
      await endSupportSession("Admin ended session from banner");
      toast.success("Support session ended. Returned to Super Admin context.");
      navigate({ to: "/super-admin/support-sessions" });
    } catch (err: any) {
      toast.error(err.message || "Failed to exit support session");
      setIsEnding(false);
    }
  };

  return (
    <aside
      role="alert"
      aria-label="Support Session Banner"
      className={`relative z-50 w-full border-b shadow-sm transition-colors ${
        isCritical
          ? "bg-amber-600 text-white border-amber-700 dark:bg-amber-700"
          : "bg-amber-500 text-amber-950 border-amber-600 dark:bg-amber-600 dark:text-amber-50"
      } ${className}`}
    >
      <div className="mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        {/* Left: Indicator & Tenant / User Context */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15 shadow-inner">
            <ShieldAlert className="h-4 w-4 animate-pulse text-current" />
          </div>

          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <span>SUPPORT SESSION ACTIVE</span>
              <span className="opacity-60">•</span>
              <span className="font-semibold normal-case tracking-normal">
                {supportSession.targetTenantName}
              </span>
              {supportSession.targetUserEmail && (
                <>
                  <span className="opacity-60">•</span>
                  <span className="inline-flex items-center gap-1 rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-normal normal-case">
                    <UserCheck className="h-3 w-3" />
                    {supportSession.targetUserName
                      ? `${supportSession.targetUserName} (${supportSession.targetUserEmail})`
                      : supportSession.targetUserEmail}
                  </span>
                </>
              )}
            </div>

            <p className="mt-0.5 truncate text-[11px] opacity-90">
              <span className="font-medium">Reason:</span> {supportSession.reason}
              <span className="ml-2 opacity-70">
                (All privileged actions are audited under this session)
              </span>
            </p>
          </div>
        </div>

        {/* Right: Timer & Exit Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="secondary"
            className="flex items-center gap-1 bg-black/20 text-current border-none px-2 py-0.5 text-xs font-mono font-medium shadow-none"
          >
            <Clock className="h-3 w-3" />
            <span>{minsRemaining}m left</span>
          </Badge>

          {showConsoleLink && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-black/25 bg-black/10 hover:bg-black/20 text-current text-xs shadow-none hidden md:flex items-center gap-1"
              onClick={() => navigate({ to: "/super-admin/support-sessions" })}
            >
              <ExternalLink className="h-3 w-3" />
              Console
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            disabled={isEnding}
            onClick={handleExitSession}
            className="h-7 gap-1.5 bg-black/85 text-white hover:bg-black font-semibold text-xs shadow-sm"
          >
            {isEnding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Exit Support Session
          </Button>
        </div>
      </div>
    </aside>
  );
}
