import { useEffect, useState } from "react";
import { Bell, Menu, X, ChevronLeft, Home } from "lucide-react";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  // Close mobile menu when clicking outside or on link
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Navigation Header */}
      <nav className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left section - Logo & Mobile menu button */}
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

              {/* Logo/Dashboard link */}
              <div className="ml-2 md:ml-0">
                <Link
                  to="/dashboard"
                  className="flex items-center text-xl font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  aria-label="Ir para o dashboard"
                >
                  <Home size={20} className="mr-2" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
              </div>
            </div>

            {/* Desktop navigation items */}
            <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
              <ThemeToggle />
              {(user?.role === "admin" || user?.role === "superadmin") && (
                <Link
                  to="/company/settings"
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  Configurações
                </Link>
              )}
              
              {/* Notifications for admin */}
              {(user?.role === "admin" || user?.role === "superadmin") && (
                <button
                  onClick={() => setIsNotificationsOpen(true)}
                  className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  aria-label={`Notificações ${unreadCount > 0 ? `(${unreadCount} não lidas)` : ''}`}
                >
                  <Bell size={22} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              )}

              {/* User info */}
              <div className="flex items-center space-x-3">
                <div className="hidden lg:flex items-center space-x-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[120px]">
                    {user?.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                    {user?.role}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ID: {user?.companyCode}
                  </span>
                </div>
                
                {/* Mobile user info */}
                <div className="lg:hidden flex items-center">
                  <div className="text-right mr-2">
                    <div className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate max-w-[80px]">
                      {user?.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {user?.role}
                    </div>
                  </div>
                </div>

                {/* Logout button */}
                <button
                  onClick={logout}
                  className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
                  aria-label="Sair do sistema"
                >
                  <span className="hidden sm:inline">Sair</span>
                  <span className="sm:hidden">Sair</span>
                </button>
              </div>
            </div>

            {/* Mobile right section */}
            <div className="flex md:hidden items-center space-x-2">
              <ThemeToggle />
              {(user?.role === "admin" || user?.role === "superadmin") && (
                <button
                  onClick={() => setIsNotificationsOpen(true)}
                  className="relative p-2 text-gray-600 dark:text-gray-300"
                  aria-label="Notificações"
                >
                  <Bell size={22} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
            <div className="px-4 py-3 space-y-3">
              {/* User info in mobile menu */}
              <div className="pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {user?.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {user?.role} • ID: {user?.companyCode}
                </div>
              </div>

              {/* Notifications drawer for mobile */}
              <NotificationsDrawer
                open={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
              />

              {/* Back button if applicable */}
              {canGoBack && showBackButton && (
                <button
                  onClick={handleBack}
                  className="flex items-center w-full p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <ChevronLeft size={20} className="mr-2" />
                  {backLabel}
                </button>
              )}

              {(user?.role === "admin" || user?.role === "superadmin") && (
                <Link
                  to="/company/settings"
                  className="flex items-center w-full p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  Configurações da Empresa
                </Link>
              )}

              {/* Logout button in mobile menu */}
              <button
                onClick={logout}
                className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
              >
                Sair do Sistema
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Breadcrumbs */}
      {(title || (canGoBack && showBackButton)) && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Back button for desktop */}
              {canGoBack && showBackButton && (
                <button
                  onClick={handleBack}
                  className="hidden sm:flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ChevronLeft size={20} className="mr-1" />
                  {backLabel}
                </button>
              )}

              {/* Breadcrumbs */}
              <nav className="flex items-center" aria-label="Breadcrumb">
                <ol className="flex items-center space-x-1 sm:space-x-2 text-sm">
                  <li>
                    <Link
                      to="/dashboard"
                      className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      Início
                    </Link>
                  </li>
                  {title && title !== "" && (
                    <>
                      <li className="text-gray-400 dark:text-gray-600">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </li>
                      <li>
                        <span className="text-gray-900 dark:text-white font-medium capitalize">
                          {title.replace(/-/g, ' ')}
                        </span>
                      </li>
                    </>
                  )}
                </ol>
              </nav>

              {/* Title for mobile */}
              <div className="sm:hidden">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                  {title ? title.replace(/-/g, ' ') : 'Dashboard'}
                </h1>
              </div>

              {/* Back button for mobile */}
              {canGoBack && showBackButton && (
                <button
                  onClick={handleBack}
                  className="sm:hidden flex items-center justify-center w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <ChevronLeft size={18} className="mr-2" />
                  {backLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6 transition-colors duration-200">
          {children}
        </div>
      </main>

      {/* Notifications Drawer */}
      <NotificationsDrawer
        open={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </div>
  );
};

export default Layout;