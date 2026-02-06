import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { 
  Search, ExternalLink, FileText, CheckCircle, 
  Check, Loader2, Globe, Database, Calculator,
  Shield, AlertTriangle, Zap, Brain, RefreshCw,
  Target, Clock, Award, XCircle, Pause, ChevronDown, ChevronUp,
  Terminal // Added Terminal icon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ============ API CONFIG ============
const API_URL = "http://localhost:8000";

// ============ TYPES ============

interface TradePlan {
  market_id: string;
  event_ticker: string;
  title: string;
  category: string;
  side: string;
  entry_price: number;
  exit_price: number;
  stop_loss: number;
  potential_profit_cents: number;
  potential_loss_cents: number;
  risk_reward_ratio: number;
  expiry_time?: string;
  hours_to_expiry: number;
  is_0dte: boolean;
  fee_per_contract: number;
  net_profit_after_fees: number;
  settlement_source: string;
  implied_win_rate: number;
  suggested_contracts: number;
  max_risk_dollars: number;
}

// New Interface for Thought Steps
interface ThoughtStep {
  step_number: number;
  thought: string;
  timestamp: string;
  search_query?: string;
}

interface Strategy1VerifiedTrade {
  trade: TradePlan;
  source_name: string;
  source_url: string;
  source_data: string;
  kalshi_rule: string;
  current_value?: string;
  threshold?: string;
  distance_to_threshold?: string;
  ai_true_probability: number;
  market_implied_probability: number;
  edge: number;
  recommendation: "EXECUTE" | "SKIP" | "WAIT";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
  risk_factors: string[];
  time_sensitivity: string;
  adjusted_contracts: number;
  adjusted_risk_dollars: number;
  // Added new fields for Audit Trail
  thought_chain?: ThoughtStep[];
  reasoning_audit?: string;
  web_searches_performed?: number;
}

interface Strategy1VerifyResponse {
  scan_time: string;
  total_scanned: number;
  top_opportunities: Strategy1VerifiedTrade[];
  summary: string;
}

interface TimelineStep {
  id: string;
  label: string;
  icon: React.ElementType;
}

// ============ TIMELINE STEPS ============
const timelineSteps: TimelineStep[] = [
  { id: "scan", label: "Scanning Markets", icon: Search },
  { id: "source", label: "Locating Sources", icon: Globe },
  { id: "extract", label: "Extracting Data", icon: Database },
  { id: "calculate", label: "Calculating Edge", icon: Calculator },
  { id: "rank", label: "Ranking Trades", icon: Award },
];

// ============ HELPER FUNCTIONS ============

function getRecommendationColor(rec: string) {
  switch (rec) {
    case "EXECUTE": return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
    case "SKIP": return "text-rose-400 bg-rose-500/20 border-rose-500/30";
    case "WAIT": return "text-amber-400 bg-amber-500/20 border-amber-500/30";
    default: return "text-muted-foreground bg-muted";
  }
}

function getConfidenceColor(conf: string) {
  switch (conf) {
    case "HIGH": return "text-emerald-400";
    case "MEDIUM": return "text-amber-400";
    case "LOW": return "text-rose-400";
    default: return "text-muted-foreground";
  }
}

function getEdgeColor(edge: number) {
  if (edge >= 5) return "text-emerald-400";
  if (edge >= 0) return "text-amber-400";
  return "text-rose-400";
}

// ============ COMPONENTS ============

function OpportunityCard({
  opp,
  isSelected,
  onClick,
}: {
  opp: TradePlan;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "p-3 cursor-pointer transition-all border shadow-sm",
        isSelected
          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
          : "border-border bg-card hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Badge className="text-xs px-2 py-0.5 font-bold uppercase bg-secondary text-secondary-foreground border-none">
                {opp.category}
              </Badge>
              <span className="text-xs font-mono font-bold text-muted-foreground">
                {opp.event_ticker}
              </span>
            </div>
            <Badge className={cn(
              "text-xs px-2 py-0.5 font-black border-none",
              opp.side === "YES" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
            )}>
              {opp.side}
            </Badge>
          </div>
          <h4 className="text-sm font-bold leading-tight text-foreground uppercase">
            {opp.title}
          </h4>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-border/50 py-3">
          <div className="flex justify-between border-r border-border/30 pr-2">
            <span className="text-[11px] text-muted-foreground font-bold uppercase">Entry</span>
            <span className="text-sm font-mono font-bold">{opp.entry_price}¢</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-[11px] text-muted-foreground font-bold uppercase">Exit</span>
            <span className="text-sm font-mono font-bold">{opp.exit_price}¢</span>
          </div>
          
          <div className="flex justify-between border-r border-border/30 pr-2">
            <span className="text-[11px] text-muted-foreground font-bold uppercase">Stop</span>
            <span className="text-sm font-mono font-bold text-rose-500">{opp.stop_loss}¢</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-[11px] text-muted-foreground font-bold uppercase">Fee</span>
            <span className="text-sm font-mono text-muted-foreground">{opp.fee_per_contract}¢</span>
          </div>

          <div className="flex justify-between border-r border-border/30 pr-2">
            <span className="text-[11px] text-muted-foreground font-bold uppercase">Profit</span>
            <span className="text-sm font-mono text-emerald-600 font-bold">+{opp.potential_profit_cents}¢</span>
          </div>
          <div className="flex justify-between pl-2">
            <span className="text-[11px] text-muted-foreground font-bold uppercase">Loss</span>
            <span className="text-sm font-mono text-rose-500 font-bold">-{opp.potential_loss_cents}¢</span>
          </div>
        </div>

        <div className="flex justify-between items-end pt-1">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase">Net Profit</span>
            <span className="text-base font-mono font-black text-primary">
              +{opp.net_profit_after_fees}¢
            </span>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className={cn(
              "text-xs font-bold px-1 rounded",
              opp.hours_to_expiry < 24 ? "bg-orange-500/10 text-orange-600" : "text-muted-foreground"
            )}>
              {Math.floor(opp.hours_to_expiry)}h left
            </div>
            {opp.is_0dte && (
              <Badge className="text-[10px] bg-orange-500 text-white mt-1">0DTE</Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function VerifiedTradeCard({
  verified,
  rank,
  isExpanded,
  onClick,
}: {
  verified: Strategy1VerifiedTrade;
  rank: number;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const { trade, recommendation, confidence, edge, ai_true_probability, market_implied_probability } = verified;
  
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all border-2",
        isExpanded ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        recommendation === "EXECUTE" && !isExpanded && "border-emerald-500/50"
      )}
      onClick={onClick}
    >
      {/* Header - Always Visible */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center font-black text-lg",
              rank === 1 ? "bg-amber-500 text-white" : 
              rank === 2 ? "bg-slate-400 text-white" : 
              "bg-orange-700 text-white"
            )}>
              {rank}
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge className={cn("text-xs font-bold border", getRecommendationColor(recommendation))}>
                {recommendation === "EXECUTE" && <CheckCircle className="h-3 w-3 mr-1" />}
                {recommendation === "SKIP" && <XCircle className="h-3 w-3 mr-1" />}
                {recommendation === "WAIT" && <Pause className="h-3 w-3 mr-1" />}
                {recommendation}
              </Badge>
              <Badge className={cn("text-xs", getConfidenceColor(confidence))}>
                {confidence}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn(
              "text-xs px-2 py-0.5 font-black border-none",
              trade.side === "YES" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
            )}>
              {trade.side}
            </Badge>
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        <h4 className="text-sm font-bold text-foreground uppercase mb-3 leading-tight">
          {trade.title}
        </h4>

        {/* Key Metrics - Compact */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-muted/30 rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-bold">Edge</div>
            <div className={cn("text-base font-mono font-black", getEdgeColor(edge))}>
              {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-bold">AI</div>
            <div className="text-base font-mono font-black text-blue-400">
              {ai_true_probability.toFixed(0)}%
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-bold">Market</div>
            <div className="text-base font-mono font-black text-muted-foreground">
              {market_implied_probability.toFixed(0)}%
            </div>
          </div>
          <div className="bg-muted/30 rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-bold">Profit</div>
            <div className="text-base font-mono font-black text-emerald-500">
              +{trade.net_profit_after_fees}¢
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Evidence Section */}
      {isExpanded && (
        <div className="border-t border-border/50 p-4 bg-muted/10 space-y-4">
          {/* Edge Display */}
          <Card className={cn(
            "p-4 border-2",
            edge >= 5 ? "border-emerald-500/50 bg-emerald-500/5" :
            edge >= 0 ? "border-amber-500/50 bg-amber-500/5" :
            "border-rose-500/50 bg-rose-500/5"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase font-bold">Calculated Edge</div>
                <div className={cn("text-3xl font-mono font-black", getEdgeColor(edge))}>
                  {edge > 0 ? "+" : ""}{edge.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">AI Estimate: <span className="text-blue-400 font-bold">{ai_true_probability.toFixed(0)}%</span></div>
                <div className="text-xs text-muted-foreground">Market Price: <span className="font-bold">{market_implied_probability.toFixed(0)}%</span></div>
              </div>
            </div>
            {verified.distance_to_threshold && (
              <div className="mt-2 text-xs text-muted-foreground">
                <Target className="h-3 w-3 inline mr-1" />
                Distance: <span className="font-mono font-bold">{verified.distance_to_threshold}</span>
              </div>
            )}
          </Card>

          {/* Source & Rule Grid */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3 bg-background/50 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-medium text-blue-400">{verified.source_name}</span>
              </div>
              <div className="bg-muted/50 rounded p-2 font-mono text-xs text-foreground leading-relaxed h-16 overflow-y-auto">
                {verified.source_data}
              </div>
              {verified.source_url && (
                <a
                  href={verified.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1"
                >
                  View source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </Card>

            <Card className="p-3 bg-background/50 border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium text-purple-400">Resolution Rule</span>
              </div>
              <div className="bg-muted/50 rounded p-2 font-mono text-xs text-foreground leading-relaxed h-16 overflow-y-auto">
                {verified.kalshi_rule}
              </div>
            </Card>
          </div>

          {/* Current Value & Threshold */}
          {(verified.current_value || verified.threshold) && (
            <div className="grid grid-cols-2 gap-3">
              {verified.current_value && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Current Value</div>
                  <div className="text-lg font-mono font-bold text-foreground">{verified.current_value}</div>
                </div>
              )}
              {verified.threshold && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold">Threshold</div>
                  <div className="text-lg font-mono font-bold text-foreground">{verified.threshold}</div>
                </div>
              )}
            </div>
          )}

          {/* Reasoning */}
          <Card className="p-3 bg-blue-500/5 border-blue-500/30">
            <div className="flex items-start gap-2">
              <Brain className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-sm text-foreground">
                <span className="font-semibold text-blue-400">AI Analysis: </span>
                {verified.reasoning}
              </div>
            </div>
          </Card>

          {/* Risk Factors */}
          {verified.risk_factors.length > 0 && (
            <Card className="p-3 bg-amber-500/5 border-amber-500/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-sm font-semibold text-amber-400">Risk Factors:</span>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                    {verified.risk_factors.map((risk, i) => (
                      <li key={i}>• {risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          {/* NEW: Thought Audit Trail Display */}
          {(verified.thought_chain && verified.thought_chain.length > 0) || verified.reasoning_audit ? (
            <Card className="p-3 bg-slate-950 border-slate-800 shadow-inner">
               <div className="flex items-center gap-2 mb-2 text-slate-400 border-b border-slate-800 pb-2">
                 <Terminal className="h-3.5 w-3.5" />
                 <span className="text-xs font-bold uppercase tracking-wider">Thought Signatures & Search Audit</span>
                 {verified.web_searches_performed !== undefined && verified.web_searches_performed > 0 && (
                   <Badge variant="outline" className="ml-auto text-[9px] border-slate-700 text-slate-400 h-5 px-2">
                     <Globe className="h-2.5 w-2.5 mr-1" />
                     {verified.web_searches_performed} Web Searches
                   </Badge>
                 )}
               </div>
               
               <div className="space-y-4 font-mono text-xs max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {verified.thought_chain && verified.thought_chain.length > 0 ? (
                    verified.thought_chain.map((step) => (
                      <div key={step.step_number} className="relative pl-4 border-l border-slate-800">
                        <div className="absolute left-[-2.5px] top-1.5 w-1 h-1 rounded-full bg-slate-600" />
                        <div className="text-slate-500 text-[10px] mb-0.5 font-bold">STEP {step.step_number}</div>
                        <div className="text-slate-300 leading-relaxed opacity-90">
                          {step.thought}
                        </div>
                        {step.search_query && (
                          <div className="mt-2 flex items-center gap-2 text-blue-400 bg-blue-950/20 w-fit px-2 py-1 rounded border border-blue-900/30">
                             <Search className="h-3 w-3" />
                             <span className="italic opacity-80">Searching for: "{step.search_query}"</span>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    // Fallback to text string if structured chain missing
                    <div className="text-slate-400 whitespace-pre-wrap leading-relaxed">
                      {verified.reasoning_audit}
                    </div>
                  )}
               </div>
            </Card>
          ) : null}

          {/* Trade Details & Time */}
          <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t border-border/30">
            <div className="flex gap-4">
              <span>Entry: <span className="font-mono font-bold text-foreground">{trade.entry_price}¢</span></span>
              <span>Stop: <span className="font-mono font-bold text-rose-400">{trade.stop_loss}¢</span></span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{verified.time_sensitivity}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function MarketMonitor({ 
  selectedId, 
  onSelectOpportunity 
}: { 
  selectedId: string | null; 
  onSelectOpportunity: (opportunity: TradePlan) => void; 
}) {
  const [opportunities, setOpportunities] = useState<TradePlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchOpportunities = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/strategy1/scan?categories=Crypto,Financial&bankroll=1000`);
      if (!res.ok) throw new Error("Backend scan failed");
      
      const data = await res.json();
      setOpportunities(data.trades || []);
      
      if (data.trades.length > 0) {
        toast.success(`Found ${data.trades.length} opportunities`);
      }
    } catch (err) {
      toast.error("Strategy Engine Offline");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredOpportunities = opportunities.filter(opp => 
    opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    opp.event_ticker.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> All Opportunities
          </h2>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchOpportunities} 
            disabled={isLoading}
            className="h-8 px-3 text-xs font-bold"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            SCAN
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9 text-sm bg-muted/30 border-border"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {!isLoading && filteredOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.market_id}
              opp={opportunity}
              isSelected={selectedId === opportunity.market_id}
              onClick={() => onSelectOpportunity(opportunity)}
            />
          ))}
          
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Scanning...</span>
            </div>
          )}
          
          {!isLoading && opportunities.length === 0 && (
            <div className="text-center py-16 text-muted-foreground/60">
              <p className="text-sm font-bold">No trades found</p>
              <p className="text-xs">Click SCAN to search</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function AIVerificationPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<Strategy1VerifyResponse | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTop3 = async () => {
    setIsLoading(true);
    setCurrentStep(0);
    setResponse(null);
    setExpandedId(null);

    // Animate through steps
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => Math.min(prev + 1, timelineSteps.length - 1));
    }, 3000);

    try {
      const res = await fetch(`${API_URL}/strategy1/verify_top3?categories=Crypto,Financial&only_0dte=true&bankroll=1000`);
      if (!res.ok) throw new Error("Verification failed");
      
      const data: Strategy1VerifyResponse = await res.json();
      
      clearInterval(stepInterval);
      setCurrentStep(timelineSteps.length);
      setResponse(data);
      
      const execCount = data.top_opportunities.filter(t => t.recommendation === "EXECUTE").length;
      if (execCount > 0) {
        toast.success(`Found ${execCount} executable trades!`);
      } else if (data.top_opportunities.length > 0) {
        toast.info("Analysis complete - review recommendations");
      } else {
        toast.info("No opportunities found right now");
      }
      
      // Auto-expand the first one
      if (data.top_opportunities.length > 0) {
        setExpandedId(data.top_opportunities[0].trade.market_id);
      }
    } catch (err) {
      clearInterval(stepInterval);
      toast.error("Verification failed");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (marketId: string) => {
    setExpandedId(expandedId === marketId ? null : marketId);
  };

  return (
    <div className="h-full flex flex-col bg-card/20">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> AI Verification Engine
          </h2>
        </div>
        <Button 
          onClick={fetchTop3} 
          disabled={isLoading}
          className="w-full h-12 text-sm font-black bg-primary/80 hover:bg-primary text-primary-foreground text-black shadow-lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ANALYZING MARKETS...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5 mr-2" />
              FIND & VERIFY TOP 3 TRADES
            </>
          )}
        </Button>
      </div>

      {/* Timeline Progress */}
      {isLoading && (
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            {timelineSteps.map((step, i) => {
              const Icon = step.icon;
              const isComplete = i < currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step.id} className="flex-1">
                  <div className={cn(
                    "flex items-center justify-center gap-1 p-2 rounded-lg transition-all text-xs",
                    isComplete ? "bg-emerald-500/20 text-emerald-400" : 
                    isCurrent ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground/50"
                  )}>
                    {isComplete ? <Check className="h-3 w-3" /> : 
                     isCurrent ? <Loader2 className="h-3 w-3 animate-spin" /> : 
                     <Icon className="h-3 w-3" />}
                    <span className="hidden lg:inline font-medium">{step.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {response?.top_opportunities.map((verified, i) => (
            <VerifiedTradeCard
              key={verified.trade.market_id}
              verified={verified}
              rank={i + 1}
              isExpanded={expandedId === verified.trade.market_id}
              onClick={() => toggleExpand(verified.trade.market_id)}
            />
          ))}

          {response && response.top_opportunities.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-bold">No opportunities found</p>
              <p className="text-xs">Markets may be closed or no edge detected</p>
            </div>
          )}

          {!isLoading && !response && (
            <div className="text-center py-20 text-muted-foreground/60">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                <Brain className="h-10 w-10 opacity-30" />
              </div>
              <p className="text-lg font-bold mb-1">AI Ready</p>
              <p className="text-sm">Click the button above to scan markets,</p>
              <p className="text-sm">verify sources, and find the top 3 trades</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Summary Footer */}
      {response && (
        <div className="p-4 border-t border-border/50 bg-muted/20">
          <p className="text-sm text-foreground font-medium">{response.summary}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Scanned {response.total_scanned} markets • {new Date(response.scan_time).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

const MissionControl = () => {
  const [searchParams] = useSearchParams();
  const isGuest = searchParams.get("guest") === "true";
  const [selectedOpportunity, setSelectedOpportunity] = useState<TradePlan | null>(null);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopNavigation isGuest={isGuest} />
      <div className="border-b border-border/50 bg-card/30 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground font-mono">AI-POWERED KALSHI TRADING</h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> AGENT ONLINE
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: All Opportunities */}
        <div className="w-96 shrink-0 overflow-hidden">
          <MarketMonitor 
            selectedId={selectedOpportunity?.market_id ?? null} 
            onSelectOpportunity={setSelectedOpportunity} 
          />
        </div>
        
        {/* Right: Combined AI Verification + Evidence */}
        <div className="flex-1 overflow-hidden border-l border-border/30">
          <AIVerificationPanel />
        </div>
      </div>
    </div>
  );
};

export default MissionControl;