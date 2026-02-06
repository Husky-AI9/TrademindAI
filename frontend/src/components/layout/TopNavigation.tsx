import { TrendingUp, LayoutDashboard, Briefcase, Settings, User, LogOut, LogIn, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavLink } from "@/components/NavLink";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface TopNavigationProps {
  isGuest?: boolean;
}

const navLinks = [
  { label: "Stock Analyst", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Prediction Market Analyst", icon: Radio, to: "/mission-control" },
];

export function TopNavigation({ isGuest = false }: TopNavigationProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/");
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-serif text-xl font-semibold text-foreground">
          TradeMind AI
        </span>
        {isGuest && (
          <Badge variant="secondary" className="ml-2">
            Guest Mode
          </Badge>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="hidden md:flex items-center gap-1">
        {navLinks.map((link) => (
          <NavLink key={link.label} to={isGuest ? `${link.to}?guest=true` : link.to} className="gap-2">
            <link.icon className="h-4 w-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* User Profile / Guest Actions */}
      <div className="flex items-center gap-3">
        {isGuest ? (
          <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
            <LogIn className="h-4 w-4" />
            Exit Guest Mode
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Settings className="h-4 w-4" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      U
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium">Account</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </header>
  );
}
