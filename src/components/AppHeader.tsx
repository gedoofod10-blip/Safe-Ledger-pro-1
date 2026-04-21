import { ArrowRight, Search, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '@/components/NotificationBell';

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  showSearch?: boolean;
  showMenu?: boolean;
  showNotifications?: boolean;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
  actions?: React.ReactNode;
}

const AppHeader = ({ title, showBack, showSearch, showMenu, showNotifications, onMenuClick, onSearchClick, actions }: AppHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="bg-header text-header flex items-center justify-between px-4 py-3 sticky top-0 z-50 shadow-md">
      <div className="flex items-center gap-3">
        {showMenu && (
          <button onClick={onMenuClick} className="p-1">
            <Menu className="w-6 h-6 text-white" />
          </button>
        )}
        {showBack && (
          <button onClick={() => navigate(-1)} className="p-1">
            <ArrowRight className="w-6 h-6 text-white" />
          </button>
        )}
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {showNotifications && <NotificationBell />}
        {showSearch && (
          <button onClick={onSearchClick} className="p-1">
            <Search className="w-5 h-5 text-white" />
          </button>
        )}
        {actions}
      </div>
    </header>
  );
};

export default AppHeader;
