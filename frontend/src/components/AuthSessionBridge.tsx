import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LOGIN_ROUTE,
  registerSessionExpiredHandler,
  resetSessionRedirectFlag,
} from "../config/authSession";

/**
 * Conecta o interceptor HTTP ao React Router para redirecionar ao login
 * sem reload completo quando o refresh falhar.
 */
const AuthSessionBridge: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      navigate(LOGIN_ROUTE, { replace: true });
    });
    resetSessionRedirectFlag();

    return () => {
      registerSessionExpiredHandler(() => {
        window.location.assign(LOGIN_ROUTE);
      });
    };
  }, [navigate]);

  return null;
};

export default AuthSessionBridge;
