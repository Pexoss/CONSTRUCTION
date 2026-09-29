import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { useAuthStore } from "../store/auth.store";
import { billingService } from "../modules/billings/billing.service";

function calendarDateKeySaoPaulo(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function companyIdFromUser(user: { companyId?: unknown } | null): string {
  if (!user?.companyId) return "";
  if (typeof user.companyId === "string") return user.companyId;
  if (typeof user.companyId === "object" && user.companyId && "_id" in user.companyId) {
    return String((user.companyId as { _id?: string })._id || "");
  }
  return String(user.companyId);
}

/**
 * No primeiro acesso do dia, gera fechamentos vencidos da empresa.
 */
const DailyBillingSync: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !localStorage.getItem("accessToken")) {
      return;
    }
    const companyId = companyIdFromUser(user);
    if (!companyId) {
      return;
    }
    const todayKey = calendarDateKeySaoPaulo();
    const storageKey = `daily-billing-sync:${companyId}:${todayKey}`;
    if (localStorage.getItem(storageKey) === "1") {
      return;
    }
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const payload = await billingService.runDailySync();
        if (cancelled) {
          return;
        }
        localStorage.setItem(storageKey, "1");
        const created = Number(payload?.data?.created || 0);
        if (created > 0) {
          queryClient.invalidateQueries({ queryKey: ["billings"] });
          queryClient.invalidateQueries({ queryKey: ["financial-board"] });
          queryClient.invalidateQueries({ queryKey: ["rental-billings"] });
          toast.info(
            created === 1
              ? "1 fechamento vencido foi atualizado automaticamente."
              : `${created} fechamentos vencidos foram atualizados automaticamente.`,
          );
        }
      } catch {
        /* Próximo carregamento tenta de novo. */
      } finally {
        runningRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, queryClient]);

  return null;
};

export default DailyBillingSync;
