import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import UserDashboard from "@/pages/UserDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import TechDashboard from "@/pages/TechDashboard";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

function Router() {
  const [dashboardType, setDashboardType] = useState<'user' | 'admin' | 'tech'>('user');
  const [location, setLocation] = useLocation();

  const switchDashboard = (type: 'user' | 'admin' | 'tech') => {
    setDashboardType(type);
    if (type === 'user') setLocation("/");
    else if (type === 'admin') setLocation("/admin");
    else if (type === 'tech') setLocation("/tech");
  };

  useEffect(() => {
    // Set dashboard type based on current path
    if (location === "/admin") setDashboardType('admin');
    else if (location === "/tech") setDashboardType('tech');
    else setDashboardType('user');
  }, [location]);

  return (
    <div className="h-screen flex flex-col">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <svg className="h-8 w-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17l-.59.59-.58.58V4h16v12z" />
                </svg>
                <span className="ml-2 text-xl font-bold text-neutral-800">ChatHub</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <button
                  onClick={() => switchDashboard('user')}
                  className={`${
                    dashboardType === 'user'
                      ? "border-primary-dark text-neutral-900" 
                      : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  User Dashboard
                </button>
                <button
                  onClick={() => switchDashboard('admin')}
                  className={`${
                    dashboardType === 'admin'
                      ? "border-primary-dark text-neutral-900" 
                      : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Admin Dashboard
                </button>
                <button
                  onClick={() => switchDashboard('tech')}
                  className={`${
                    dashboardType === 'tech'
                      ? "border-primary-dark text-neutral-900" 
                      : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700"
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Tech Support
                </button>
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              <div className="ml-3 relative">
                <div>
                  <button
                    type="button"
                    className="bg-white flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-dark"
                  >
                    <span className="sr-only">Open user menu</span>
                    <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center">
                      <span className="font-medium">
                        {dashboardType === 'admin' ? "A" : dashboardType === 'tech' ? "T" : "U"}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
            <div className="-mr-2 flex items-center sm:hidden">
              <button
                type="button"
                className="inline-flex items-center justify-center p-2 rounded-md text-neutral-400 hover:text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-dark"
                onClick={() => {
                  const mobileMenu = document.getElementById('mobile-menu');
                  if (mobileMenu) {
                    mobileMenu.classList.toggle('hidden');
                  }
                }}
              >
                <span className="sr-only">Open main menu</span>
                <svg
                  className="block h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="sm:hidden hidden" id="mobile-menu">
          <div className="pt-2 pb-3 space-y-1">
            <button
              onClick={() => switchDashboard('user')}
              className={`${
                dashboardType === 'user'
                  ? "bg-primary-50 border-primary-dark text-primary-dark"
                  : "border-transparent text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 hover:text-neutral-700"
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium w-full text-left`}
            >
              User Dashboard
            </button>
            <button
              onClick={() => switchDashboard('admin')}
              className={`${
                dashboardType === 'admin'
                  ? "bg-primary-50 border-primary-dark text-primary-dark"
                  : "border-transparent text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 hover:text-neutral-700"
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium w-full text-left`}
            >
              Admin Dashboard
            </button>
            <button
              onClick={() => switchDashboard('tech')}
              className={`${
                dashboardType === 'tech'
                  ? "bg-primary-50 border-primary-dark text-primary-dark"
                  : "border-transparent text-neutral-500 hover:bg-neutral-50 hover:border-neutral-300 hover:text-neutral-700"
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium w-full text-left`}
            >
              Tech Support
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <Switch>
          <Route path="/" component={UserDashboard} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/tech" component={TechDashboard} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
