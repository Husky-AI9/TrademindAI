import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Loader2, 
  Sparkles,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shield,
  Mic,
  MicOff,
  Image,
  X,
  FileText,
  LineChart,
  ChevronDown, // Added
  ChevronUp,   // Added
  ScrollText   // Added
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ============ API CONFIG ============
const API_URL = "http://localhost:8000";

// ============ TICKER SEARCH ============

interface TickerSearchProps {
  value: string; // Controlled input
  onChange: (val: string) => void;
  onSearch: (ticker: string) => void; // Keeps explicit search capability if needed
  recentSearches: string[];
}

function TickerSearch({ value, onChange, onSearch, recentSearches }: TickerSearchProps) {
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSearch(value.toUpperCase());
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Enter Ticker Symbol (e.g., AAPL)"
          className="pl-12 h-14 text-lg font-mono bg-card border-2 border-border focus:border-primary transition-colors"
        />
      </form>
      
      {/* Recent Tickers */}
      {recentSearches.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Recent:</span>
          {recentSearches.map((ticker) => (
            <Badge
              key={ticker}
              variant="outline"
              className="cursor-pointer hover:bg-accent transition-colors gap-1 py-1"
              onClick={() => onChange(ticker)}
            >
              <span className="font-mono font-semibold">{ticker}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ PRICE CHART ============

interface PriceChartProps {
  ticker: string | null; // Nullable now
}

interface ChartDataPoint {
  time: string;
  price: number;
}

const timeframes = [
  { label: "1D", value: "1d", interval: "15m" }, 
  { label: "5D", value: "5d", interval: "1h" },
  { label: "1M", value: "1mo", interval: "1d" },
  { label: "6M", value: "6mo", interval: "1wk" }
];

function PriceChart({ ticker }: PriceChartProps) {
  const [activeTimeframe, setActiveTimeframe] = useState(timeframes[2]); 
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false); // Track if we ever fetched

  useEffect(() => {
    if (!ticker) return; // Don't fetch if no ticker is "analyzed" yet

    const fetchChartData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/get_stock_history?ticker=${ticker}&period=${activeTimeframe.value}&interval=${activeTimeframe.interval}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setHasFetched(true);
        }
      } catch (err) {
        console.error("Failed to fetch chart", err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [ticker, activeTimeframe]); // Runs when "analyzed" ticker changes
  
  // -- PLACEHOLDER VIEW (If no analysis yet) --
  if (!ticker || !hasFetched) {
    return (
      <Card className="bg-card border-border min-h-[400px] flex items-center justify-center border-dashed">
        <div className="text-center space-y-3 text-muted-foreground">
          <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <LineChart className="h-8 w-8 opacity-50" />
          </div>
          <h3 className="text-lg font-medium">Ready to Analyze</h3>
          <p className="text-sm max-w-xs mx-auto">
            Enter a ticker symbol above and click "Run AI Analyst" to reveal historical price action and insights.
          </p>
        </div>
      </Card>
    );
  }

  // -- DATA VIEW --
  const currentPrice = data.length > 0 ? data[data.length - 1].price : 0;
  const previousPrice = data.length > 0 ? data[0].price : 0;
  const priceChange = currentPrice - previousPrice;
  const percentChange = previousPrice !== 0 ? ((priceChange / previousPrice) * 100).toFixed(2) : "0.00";
  const isPositive = priceChange >= 0;

  return (
    <Card className="bg-card border-border min-h-[400px]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-2xl font-mono font-bold">{ticker}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold font-mono">
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : `$${currentPrice.toFixed(2)}`}
              </span>
              {!loading && (
                <span className={`flex items-center text-sm font-medium ${isPositive ? 'text-success' : 'text-destructive'}`}>
                  {isPositive ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                  {isPositive ? '+' : ''}{percentChange}%
                </span>
              )}
            </div>
          </div>
          
          <div className="flex gap-1">
            {timeframes.map((tf) => (
              <Button
                key={tf.label}
                variant={activeTimeframe.label === tf.label ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTimeframe(tf)}
                className="text-xs font-mono px-3"
              >
                {tf.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        <div className="h-[300px] w-full relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10 backdrop-blur-[1px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="time" 
                axisLine={false} 
                tickLine={false}
                minTickGap={30}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                domain={['auto', 'auto']}
                axisLine={false}
                tickLine={false}
                width={50}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--popover-foreground))',
                }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ AI ANALYST BUTTON ============

interface AIAnalystButtonProps {
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

function AIAnalystButton({ onAnalyze, isAnalyzing }: AIAnalystButtonProps) {
  return (
    <Button
      onClick={onAnalyze}
      disabled={isAnalyzing}
      className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-3 transition-all duration-300 hover:shadow-lg"
      size="lg"
    >
      {isAnalyzing ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Analyzing Market Data...</span>
        </>
      ) : (
        <>
          <Brain className="h-6 w-6" />
          <span>RUN AI ANALYST</span>
          <Sparkles className="h-5 w-5" />
        </>
      )}
    </Button>
  );
}

// ============ STRATEGY CARDS ============
interface StrategyCardsProps {
  strategy: {
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    confidence: number;
    reasoning?: string;
    audit?: string; // Added optional audit field
  } | null;
  ticker: string;
}

function StrategyCards({ strategy, ticker }: StrategyCardsProps) {
  const [isAuditOpen, setIsAuditOpen] = useState(false); // State for toggle

  if (!strategy) {
    return (
      <Card className="bg-card border-border border-dashed w-full">
        <CardContent className="p-6 flex items-center justify-center h-32">
          <p className="text-muted-foreground text-sm">Run AI Analysis to see recommendations</p>
        </CardContent>
      </Card>
    );
  }

  const potentialGain = strategy.entryPrice > 0 
    ? ((strategy.exitPrice - strategy.entryPrice) / strategy.entryPrice * 100).toFixed(2)
    : "0.00";
    
  const potentialLoss = strategy.entryPrice > 0
    ? ((strategy.entryPrice - strategy.stopLoss) / strategy.entryPrice * 100).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Entry Price */}
        <Card className="bg-card border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-primary" />
              Entry Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-foreground">
              ${strategy.entryPrice.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Confidence: {strategy.confidence}%
            </p>
          </CardContent>
        </Card>

        {/* Exit Price / Target */}
        <Card className="bg-card border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-success" />
              Take Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-success">
              ${strategy.exitPrice.toFixed(2)}
            </div>
            <p className="text-sm text-success flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              +{potentialGain}% potential gain
            </p>
          </CardContent>
        </Card>

        {/* Stop Loss */}
        <Card className="bg-card border-border hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-destructive" />
              Stop Loss
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-destructive">
              ${strategy.stopLoss.toFixed(2)}
            </div>
            <p className="text-sm text-destructive flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3" />
              -{potentialLoss}% max loss
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reasoning Trace */}
      {strategy.reasoning && (
        <Card className="bg-muted/30 border-border">
          <CardContent className="p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold mb-2">
              <FileText className="h-4 w-4" /> AI Reasoning Trace
            </h4>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {strategy.reasoning}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detailed Audit Dropdown (New) */}
      {strategy.audit && (
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAuditOpen(!isAuditOpen)}
            className="w-full justify-between border-dashed text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              View Thought Process Audit
            </span>
            {isAuditOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          
          {isAuditOpen && (
            <Card className="mt-2 bg-muted/10 border-border border-dashed">
              <CardContent className="p-4">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {strategy.audit}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ============ MULTIMODAL INPUT (Same) ============

interface MultimodalInputProps {
  onFileSelect: (file: File | null) => void;
  currentFile: File | null;
}

function MultimodalInput({ onFileSelect, currentFile }: MultimodalInputProps) {
  // ... (Identical to previous implementation)
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentFile) {
      setPreviewUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(currentFile);
  }, [currentFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) { onFileSelect(file); }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) { onFileSelect(file); }
  };
  const toggleListening = () => {
    setIsListening(!isListening);
    if (!isListening) { toast.info("Listening mode enabled (Simulated)"); }
  };
  const clearFile = () => {
    onFileSelect(null);
    if (fileInputRef.current) { fileInputRef.current.value = ""; }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Live Perception</h3>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-all duration-200",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground",
          previewUrl && "border-success bg-success/5"
        )}
      >
        {previewUrl ? (
           <div className="relative">
             <img src={previewUrl} alt="Uploaded chart" className="w-full h-32 object-cover rounded-md"/>
             <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={clearFile}><X className="h-4 w-4" /></Button>
             <p className="mt-2 text-sm text-success text-center">Chart image ready for AI analysis</p>
           </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-muted"><Image className="h-6 w-6 text-muted-foreground" /></div>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Drag chart images here </p>
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      </div>
    </div>
  );
}

// ============ MARKET SCOUT (Same) ============
interface ScoutResult {
  ticker: string;
  price: number;
  news_catalyst: string;
  sentiment: string;
}

interface MarketScoutProps {
  onSelectTicker: (ticker: string) => void;
}

function MarketScout({ onSelectTicker }: MarketScoutProps) {
  const [budget, setBudget] = useState("10000");
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ScoutResult[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const handleScout = async () => {
    setIsScanning(true);
    setResults([]);
    try {
      const response = await fetch(`${API_URL}/get_news_trading_candidates?budget=${budget}`);
      if (!response.ok) throw new Error("Scout failed");
      
      const data: ScoutResult[] = await response.json();
      setResults(data);
      if (data.length === 0) {
        toast.info("No candidates found matching criteria.");
      }
    } catch (error) {
      console.error("Scout error:", error);
      toast.error("Failed to fetch market candidates.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectResult = (ticker: string) => {
    setSelectedTicker(ticker);
    onSelectTicker(ticker);
  };

  return (
    // 1. Added 'flex flex-col' to Card so children can fill height
    <Card className="bg-card border-border h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          Daily Deep Scout
        </CardTitle>
      </CardHeader>
      
      {/* 2. Added 'flex-1 flex flex-col' to Content to fill remaining Card space */}
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Budget Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Trading Budget
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="pl-7 font-mono bg-background"
              placeholder="100"
            />
          </div>
        </div>

        {/* Scout Button */}
        <Button
          onClick={handleScout}
          disabled={isScanning}
          className="w-full gap-2"
          variant="secondary"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI Scanning Wires...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Find Catalyst Plays
            </>
          )}
        </Button>

        {/* Results Container */}
        {/* 3. REMOVED 'max-h-[350px] overflow-y-auto' to kill the scrollbar */}
        {/* 4. ADDED 'flex-1' so it takes up any empty vertical space */}
        <div className="space-y-2 flex-1">
          {results.length === 0 && !isScanning && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Enter your budget and click Scout to find news-driven opportunities.
            </div>
          )}
          
          {results.map((result) => (
            <div
              key={result.ticker}
              onClick={() => handleSelectResult(result.ticker)}
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md",
                selectedTicker === result.ticker
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:border-muted-foreground"
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">{result.ticker}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">${result.price.toFixed(2)}</span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      result.sentiment.includes("Bullish") ? "border-success text-success" : 
                      result.sentiment.includes("Bearish") ? "border-destructive text-destructive" :
                      "border-warning text-warning"
                    )}
                  >
                    {result.sentiment}
                  </Badge>
                </div>
                
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {result.news_catalyst}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============ MAIN DASHBOARD COMPONENT ============

const Dashboard = () => {
  // Input state (what is typed in the box)
  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  
  // Analyzed state (what has explicitly been sent to the AI/Chart)
  const [analyzedTicker, setAnalyzedTicker] = useState<string | null>(null);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const [strategy, setStrategy] = useState<{
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    confidence: number;
    reasoning?: string;
    audit?: string; // Added field
  } | null>(null);
  
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const guestMode = searchParams.get("guest") === "true";
    setIsGuest(guestMode);
    if (guestMode) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user && !guestMode) navigate("/");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user && !guestMode) navigate("/");
    });
    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  // Update input but DO NOT fetch chart yet
  const handleInputChange = (ticker: string) => {
    setSelectedTicker(ticker);
  };

  // Called when clicking Scout result or typing
  const handleSetTicker = (ticker: string) => {
    setSelectedTicker(ticker);
  };

  // MAIN TRIGGER
  const handleAnalyze = async () => {
    if (!selectedTicker) {
      toast.error("Please enter a ticker symbol.");
      return;
    }

    setIsAnalyzing(true);
    setStrategy(null);
    
    // 1. Trigger the Chart Update
    setAnalyzedTicker(selectedTicker);
    
    // 2. Add to Recent History
    setRecentSearches(prev => {
      const filtered = prev.filter(t => t !== selectedTicker);
      return [selectedTicker, ...filtered].slice(0, 5);
    });

    // 3. Perform Analysis
    const formData = new FormData();
    
    // REMOVED: formData.append("ticker", selectedTicker); 
    // REASON: The backend expects 'ticker' in the URL query string, not the form body.

    if (currentFile) {
      formData.append("chart_image", currentFile);
    }

    try {
      // FIXED: Added query param `?ticker=${selectedTicker}`
      const response = await fetch(`${API_URL}/analyze_stock?ticker=${encodeURIComponent(selectedTicker)}`, {
        method: "POST",
        body: formData, 
        // Note: Do NOT set Content-Type header manually when using FormData; 
        // the browser sets it to multipart/form-data with the correct boundary automatically.
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", errorText);
        throw new Error("Analysis failed");
      }

      const data = await response.json();
      
      setStrategy({
        entryPrice: parseFloat(data.entry_zone) || 0,
        exitPrice: parseFloat(data.take_profit) || 0,
        stopLoss: parseFloat(data.stop_loss) || 0,
        confidence: Math.round((data.confidence_score || 0) * 100),
        reasoning: data.reasoning_trace,
        audit: data.reasoning_audit // Capture the audit trail
      });
      
      toast.success("Strategy generated successfully!");

    } catch (error) {
      console.error("Analysis Error:", error);
      toast.error("Failed to generate strategy.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!user && !isGuest) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNavigation isGuest={isGuest} />
      
      <main className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Analyst Workspace (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <TickerSearch 
              value={selectedTicker}
              onChange={handleInputChange}
              onSearch={handleSetTicker} 
              recentSearches={recentSearches}
            />
            
            {/* Chart now waits for analyzedTicker */}
            <PriceChart ticker={analyzedTicker} />
            
            <AIAnalystButton 
              onAnalyze={handleAnalyze} 
              isAnalyzing={isAnalyzing} 
            />
            
            <StrategyCards strategy={strategy} ticker={selectedTicker} />
            
            {/* <MultimodalInput 
              onFileSelect={setCurrentFile}
              currentFile={currentFile}
            /> */}
          </div>
          
          {/* Right Column - Scout (1/3 width) */}
          <div className="space-y-6">
            <MarketScout onSelectTicker={handleSetTicker} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;