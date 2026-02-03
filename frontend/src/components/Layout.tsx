import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';
import { NotificationsDrawer } from "./NotificationsDrawer";
import { useNotifications } from "hooks/useNotifications";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  backTo?: string;
  backLabel?: string;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  title,
  showBackButton = true,
  backTo,
  backLabel = 'Voltar',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const { unreadCount, loadUnreadCount } = useNotifications();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const currentTitle = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'Dashboard';
  const canGoBack = location.key !== 'default' || backTo;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Header */}
      <nav className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link
                to="/dashboard"
                className="text-xl font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                aria-label="Ir para o dashboard"
              >

                Dashboard
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <NotificationsDrawer
                open={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
              />
              {user?.role === "admin" || user?.role === "superadmin" ? (
                <button
                  onClick={() => setIsNotificationsOpen(true)}
                  className="relative text-gray-600 dark:text-gray-300 hover:text-indigo-600"
                >
                  <Bell size={22} />

                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ) : null}

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {user?.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({user?.role})
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Código de Identificação({user?.companyCode})
                </span>
              </div>
              <button
                onClick={logout}
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                aria-label="Sair do sistema"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Breadcrumbs */}
      {title && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <Link
                    to="/dashboard"
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Início
                  </Link>
                </li>
                {title && title !== "" && (
                  <ol className="flex items-center space-x-2">
                    <li>
                      <Link to="/dashboard"> </Link>
                    </li>
                    <li>
                      <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </li>
                    <li>
                      <span className="text-gray-900 dark:text-white font-medium">{title}</span>
                    </li>
                  </ol>
                )}
              </ol>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
};

export default Layout;