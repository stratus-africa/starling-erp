import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Info, AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  playNotificationChime,
  type AppNotification,
} from "@/lib/notifications";

function SeverityIcon({ severity }: { severity: AppNotification["severity"] }) {
  if (severity === "success") return <CircleCheck className="h-4 w-4 text-emerald-600" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  if (severity === "error") return <CircleX className="h-4 w-4 text-destructive" />;
  return <Info className="h-4 w-4 text-primary" />;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = Date.now() - date.getTime();

  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function NotificationCenter() {
  const { profile, tenant } = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!profile?.id || !tenant?.id) return;

    setLoading(true);

    try {
      const [items, count] = await Promise.all([
        getMyNotifications(30),
        getUnreadNotificationCount(),
      ]);

      setNotifications(items);
      setUnreadCount(count);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, tenant?.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!profile?.id || !tenant?.id) return;

    const channel = supabase
      .channel(`notifications:${tenant.id}:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const notification = payload.new as AppNotification;

          if (notification.tenant_id !== tenant.id) return;

          setNotifications((current) =>
            [
              notification,
              ...current.filter((item) => item.id !== notification.id),
            ].slice(0, 30),
          );

          setUnreadCount((count) => count + 1);

          playNotificationChime();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, tenant?.id]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read_at),
    [notifications],
  );

  const handleRead = async (notification: AppNotification) => {
    if (notification.read_at) return;

    try {
      await markNotificationRead(notification.id);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                read_at: new Date().toISOString(),
              }
            : item,
        ),
      );

      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // Keep notification unread if server update fails.
    }
  };

  const handleMarkAllRead = async () => {
    if (!unreadCount) return;

    try {
      await markAllNotificationsRead();

      const now = new Date().toISOString();

      setNotifications((current) =>
        current.map((item) =>
          item.read_at
            ? item
            : {
                ...item,
                read_at: now,
              },
        ),
      );

      setUnreadCount(0);
    } catch {
      // Leave local unread state unchanged if update fails.
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(value) => {
        setOpen(value);

        if (value) {
          void loadNotifications();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />

          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[360px] p-0"
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0">
            Notifications
          </DropdownMenuLabel>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!unreadCount || loading}
            onClick={(event) => {
              event.preventDefault();
              void handleMarkAllRead();
            }}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>

        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading notifications…"
              : "You're all caught up."}
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="cursor-pointer items-start gap-2.5 px-3 py-3 focus:bg-muted"
                onSelect={(event) => {
                  event.preventDefault();
                  void handleRead(notification);
                }}
              >
                <div className="mt-0.5 shrink-0">
                  <SeverityIcon severity={notification.severity} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-sm leading-5 ${
                        notification.read_at
                          ? "font-medium"
                          : "font-semibold"
                      }`}
                    >
                      {notification.title}
                    </p>

                    {!notification.read_at && (
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>

                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {notification.message}
                  </p>

                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {formatNotificationTime(notification.created_at)}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        {unreadNotifications.length > 0 && (
          <>
            <DropdownMenuSeparator />

            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              {unreadNotifications.length} unread notification
              {unreadNotifications.length === 1 ? "" : "s"}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
