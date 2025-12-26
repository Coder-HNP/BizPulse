import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Package,
    Factory,
    Warehouse,
    ShoppingCart,
    CreditCard,
    BarChart3,
    LogOut
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import clsx from 'clsx';

export function Layout() {
    const { logout } = useAuth();
    const location = useLocation();

    const navigation = [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Raw Materials', href: '/raw-materials', icon: Package },
        { name: 'Production', href: '/production', icon: Factory },
        { name: 'Inventory', href: '/inventory', icon: Warehouse },
        { name: 'Sales', href: '/sales', icon: ShoppingCart },
        { name: 'Receivables', href: '/receivables', icon: CreditCard },
        { name: 'Expenses', href: '/expenses', icon: ShoppingCart }, // Using ShoppingCart for now
        { name: 'Finance', href: '/finance', icon: BarChart3 },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-gray-200">
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center h-16 flex-shrink-0 px-4 bg-indigo-600">
                        <span className="text-xl font-bold text-white">BizPulse</span>
                    </div>
                    <div className="flex-1 flex flex-col overflow-y-auto">
                        <nav className="flex-1 px-2 py-4 space-y-1">
                            {navigation.map((item) => {
                                const isActive = location.pathname.startsWith(item.href);
                                return (
                                    <Link
                                        key={item.name}
                                        to={item.href}
                                        className={clsx(
                                            isActive
                                                ? 'bg-indigo-50 text-indigo-600'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                                            'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                                        )}
                                    >
                                        <item.icon
                                            className={clsx(
                                                isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-500',
                                                'mr-3 flex-shrink-0 h-6 w-6'
                                            )}
                                            aria-hidden="true"
                                        />
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </nav>
                        <div className="px-2 py-4 border-t border-gray-200">
                            <button
                                onClick={() => logout()}
                                className="w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md text-red-600 hover:bg-red-50"
                            >
                                <LogOut className="mr-3 flex-shrink-0 h-6 w-6 text-red-400 group-hover:text-red-500" />
                                Sign out
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="md:pl-64 flex flex-col flex-1">
                <main className="flex-1">
                    <div className="py-6">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
