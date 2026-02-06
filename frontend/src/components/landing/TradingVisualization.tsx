import { useState, useEffect, useMemo } from "react";
import { TrendingUp, Brain, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const generatePath = (points: number[], width: number, height: number, padding: number) => {
  const maxVal = Math.max(...points);
  const minVal = Math.min(...points);
  const range = maxVal - minVal || 1;
  const stepX = (width - padding * 2) / (points.length - 1);

  return points
    .map((val, i) => {
      const x = padding + i * stepX;
      const y = padding + (1 - (val - minVal) / range) * (height - padding * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
};

const generateAreaPath = (points: number[], width: number, height: number, padding: number) => {
  const linePath = generatePath(points, width, height, padding);
  const stepX = (width - padding * 2) / (points.length - 1);
  const lastX = padding + (points.length - 1) * stepX;
  return `${linePath} L ${lastX.toFixed(1)} ${height - padding} L ${padding} ${height - padding} Z`;
};

export function TradingVisualization() {
  const [visiblePoints, setVisiblePoints] = useState(10);
  const [aiSignal, setAiSignal] = useState(false);
  const [confidence, setConfidence] = useState(0);

  // Simulated price data
  const priceData = useMemo(
    () => [
      42, 44, 43, 47, 46, 49, 48, 52, 51, 55, 53, 58, 56, 54, 57, 60, 59, 63,
      62, 66, 64, 68, 67, 71, 69, 73, 72, 76, 74, 78,
    ],
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setVisiblePoints((prev) => {
        if (prev >= priceData.length) {
          // Reset cycle
          setAiSignal(false);
          setConfidence(0);
          return 10;
        }
        return prev + 1;
      });
    }, 400);

    return () => clearInterval(interval);
  }, [priceData.length]);

  // Trigger AI signal at certain points
  useEffect(() => {
    if (visiblePoints === 18) {
      setAiSignal(true);
      setConfidence(87);
    }
    if (visiblePoints === 25) {
      setConfidence(94);
    }
  }, [visiblePoints]);

  const currentPoints = priceData.slice(0, visiblePoints);
  const currentPrice = currentPoints[currentPoints.length - 1];
  const prevPrice = currentPoints.length > 1 ? currentPoints[currentPoints.length - 2] : currentPrice;
  const isUp = currentPrice >= prevPrice;

  const W = 400;
  const H = 160;
  const PAD = 16;

  const linePath = generatePath(currentPoints, W, H, PAD);
  const areaPath = generateAreaPath(currentPoints, W, H, PAD);

  return (
    <div className="relative w-full rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">
            BTC/USD
          </span>
          <Badge
            variant="secondary"
            className="text-xs font-mono px-1.5 py-0"
          >
            LIVE
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-lg font-bold text-foreground">
            ${(currentPrice * 1000).toLocaleString()}
          </span>
          <span
            className={`text-xs font-mono ${isUp ? "text-[hsl(var(--chart-positive))]" : "text-[hsl(var(--chart-negative))]"}`}
          >
            {isUp ? "▲" : "▼"} {Math.abs(currentPrice - prevPrice).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => (
            <line
              key={pct}
              x1={PAD}
              y1={PAD + pct * (H - PAD * 2)}
              x2={W - PAD}
              y2={PAD + pct * (H - PAD * 2)}
              stroke="hsl(var(--chart-grid))"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          ))}

          {/* Area fill */}
          <path
            d={areaPath}
            fill="hsl(var(--primary) / 0.08)"
            className="transition-all duration-300"
          />

          {/* Price line */}
          <path
            d={linePath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-300"
          />

          {/* Current price dot */}
          {currentPoints.length > 0 && (() => {
            const maxVal = Math.max(...currentPoints);
            const minVal = Math.min(...currentPoints);
            const range = maxVal - minVal || 1;
            const stepX = (W - PAD * 2) / (currentPoints.length - 1);
            const cx = PAD + (currentPoints.length - 1) * stepX;
            const cy = PAD + (1 - (currentPrice - minVal) / range) * (H - PAD * 2);
            return (
              <g>
                <circle cx={cx} cy={cy} r="6" fill="hsl(var(--primary) / 0.2)" className="animate-pulse" />
                <circle cx={cx} cy={cy} r="3" fill="hsl(var(--primary))" />
              </g>
            );
          })()}
        </svg>
      </div>

      {/* AI Signal overlay */}
      {aiSignal && (
        <div className="absolute bottom-4 left-4 right-4 animate-fade-in">
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-card/90 backdrop-blur-sm p-2.5">
            <Brain className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">
                  AI Signal Detected
                </span>
                <Zap className="h-3 w-3 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground">
                Bullish momentum — {confidence}% confidence
              </span>
            </div>
            <div className="shrink-0">
              <div className="h-8 w-8 rounded-full border-2 border-primary flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{confidence}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scanning indicator */}
      {!aiSignal && (
        <div className="absolute bottom-4 left-4 animate-fade-in">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs font-mono">AI scanning market...</span>
          </div>
        </div>
      )}
    </div>
  );
}
