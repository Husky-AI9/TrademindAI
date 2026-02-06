import os
import json
import requests
import time
import yfinance as yf
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
import re

# ==========================================
# 🔐 CONFIGURATION
# ==========================================
KALSHI_API_URL = "https://api.elections.kalshi.com/trade-api/v2"

# Strategy 1 Configuration (Safe Bets - Crypto/Financial)
STRATEGY_1_MIN_PRICE = 88
STRATEGY_1_MAX_PRICE = 98

# Strategy 2 Configuration (Sports - Fade the Public)
# For head-to-head: Look for overpriced favorites to fade
STRATEGY_2_H2H_YES_MAX = 75  # Fade YES if priced above this (public overbet)
STRATEGY_2_H2H_NO_MIN = 25   # Buy NO when YES is overpriced (NO >= 25¢)
STRATEGY_2_H2H_NO_MAX = 60   # Don't buy NO above 60¢ (too expensive)
STRATEGY_2_H2H_MIN_HOURS = 2  # Minimum hours before game starts (avoid live betting)

# For head-to-head UNDERDOGS: Buy YES on undervalued underdogs
STRATEGY_2_UNDERDOG_YES_MIN = 35  # Underdog YES price minimum (not too extreme)
STRATEGY_2_UNDERDOG_YES_MAX = 48  # Underdog YES price maximum (true toss-up excluded)
# Rationale: Public overweights favorites, so underdogs at 35-48¢ often have +EV
# Research shows NFL underdogs cover 51.8% ATS, home underdogs even better

# For multi-candidate (tournaments): Heavy NO bias
STRATEGY_2_MULTI_NO_MIN = 70   # Buy NO on favorites priced 70-95¢
STRATEGY_2_MULTI_NO_MAX = 95   # (means YES is 5-30¢ - longshot territory)

MAX_RESULTS = 20

app = FastAPI(title="Dual-Engine Trading Strategy")


# ==========================================
# 🔓 CORS CONFIGURATION
# ==========================================
origins = [
    "http://localhost:8080",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini Client
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("⚠️ GOOGLE_API_KEY environment variable must be set")

# Initialize Gemini Client
try:
    client = genai.Client(api_key=GOOGLE_API_KEY)
except Exception as e:
    print(f"⚠️ Warning: Gemini Client failed to initialize. {e}")
    client = None


# ==========================================
# 📦 DATA MODELS
# ==========================================
class ChartDataPoint(BaseModel):
    time: str
    price: float

class FundamentalCandidate(BaseModel):
    ticker: str
    price: float
    news_catalyst: str
    sentiment: str 

class ArbitrageOpportunity(BaseModel):
    market_ticker: str
    event_title: str
    market_price: float
    side: str  # "YES" or "NO"
    true_probability: float
    estimated_roi: float
    logic: str

# ==========================================
# 📈 FEATURE 1: REAL-TIME CHART HISTORY
# ==========================================
@app.get("/get_stock_history", response_model=List[ChartDataPoint])
async def get_stock_history(ticker: str, period: str = "1mo", interval: str = "1d"):
    """
    Fetches historical data for the chart using yfinance.
    """
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period, interval=interval)
        
        if hist.empty:
            return []

        chart_data = []
        for date, row in hist.iterrows():
            time_str = date.strftime('%Y-%m-%d') if interval not in ['1h', '15m'] else date.strftime('%H:%M')
            chart_data.append(ChartDataPoint(time=time_str, price=row['Close']))
            
        return chart_data
    except Exception as e:
        print(f"Chart Data Error: {e}")
        return []
    
class ThoughtStep(BaseModel):
    """Individual reasoning step from Gemini's thought process"""
    step_number: int
    thought: str
    timestamp: str


class StockTradePlan(BaseModel):
    ticker: str
    action: str
    entry_zone: str
    stop_loss: str
    take_profit: str
    confidence_score: float
    reasoning_trace: str
    current_price: float
    
    # NEW: Multi-model orchestration metadata
    triage_model: str = "gemini-3-flash"
    analysis_model: str = "gemini-3-pro-preview"
    triage_sentiment: str = ""
    
    # NEW: Thought signatures audit trail
    thought_chain: List[ThoughtStep] = []
    reasoning_audit: str = ""  # Human-readable summary of thoughts
# ==========================================
# 🧠 FEATURE 2: THE AI ANALYST (Analyze Stock)
# ==========================================


# ==========================================
# 🧠 ENHANCED FEATURE: MULTI-MODEL AI ANALYST
# ==========================================
@app.post("/analyze_stock", response_model=StockTradePlan)
async def analyze_stock(ticker: str, chart_image: UploadFile = File(None)):
    """
    🚀 GEMINI 3 MULTI-MODEL ORCHESTRATION + THOUGHT SIGNATURES
    
    Architecture:
    1. TRIAGE (Gemini 3 Flash): Fast sentiment scan to determine priority
    2. DEEP ANALYSIS (Gemini 3 Pro): Full analysis with Thought Signatures
    3. AUDIT TRAIL: Capture complete reasoning chain for transparency
    
    This demonstrates:
    - Strategic model selection (Flash for speed, Pro for depth)
    - Thought Signatures for explainable AI decisions
    - Real-time data grounding via web search
    """
    
    print(f"🔍 [ORCHESTRATOR] Analyzing {ticker} with Gemini 3 family...")
    
    if not client:
        raise HTTPException(500, "Gemini client not initialized")
    
    # ==========================================
    # STEP 1: FETCH REAL MARKET DATA
    # ==========================================
    news_summary = "No news data available."
    current_price = 0.0
    recent_news = []
    
    try:
        stock = yf.Ticker(ticker)
        current_price = stock.fast_info.last_price
        
        if hasattr(stock, 'news') and stock.news:
            recent_news = [n.get('title', '') for n in stock.news[:3]]
            news_summary = " | ".join(recent_news)
    except Exception as e:
        print(f"⚠️ Data Fetch Error: {e}")
        raise HTTPException(500, f"Failed to fetch data for {ticker}")
    
    # ==========================================
    # STEP 2: TRIAGE with Gemini 3 Flash (FAST)
    # ==========================================
    print(f"⚡ [FLASH] Running fast triage scan...")
    
    triage_prompt = f"""
    You are a rapid market sentiment analyzer. Analyze {ticker} and provide a QUICK triage assessment.
    
    Current Price: ${current_price:.2f}
    Recent News: {news_summary}
    
    Respond with ONE word sentiment: BULLISH, BEARISH, or NEUTRAL
    Then in 1 sentence explain why.
    
    Format: SENTIMENT | Reason
    Example: BULLISH | Strong earnings beat with positive forward guidance
    """
    
    try:
        triage_response = client.models.generate_content(
            model="gemini-3-flash",  # FAST model for triage
            contents=triage_prompt
        )
        
        triage_text = triage_response.candidates[0].content.parts[0].text.strip()
        print(f"⚡ [FLASH] Triage result: {triage_text}")
        
    except Exception as e:
        print(f"⚠️ Flash triage failed: {e}")
        triage_text = "NEUTRAL | Unable to determine sentiment"
    
    # ==========================================
    # STEP 3: DEEP ANALYSIS with Gemini 3 Pro + THOUGHT SIGNATURES
    # ==========================================
    print(f"🧠 [PRO] Running deep analysis with Thought Signatures...")
    
    # Prepare comprehensive analysis prompt
    analysis_prompt = f"""
    You are a Senior Technical Analyst with 20+ years of experience. Perform a comprehensive trade analysis for {ticker}.
    
    MARKET CONTEXT:
    - Ticker: {ticker}
    - Current Price: ${current_price:.2f}
    - Recent News Headlines: {news_summary}
    - Flash Triage Assessment: {triage_text}
    
    YOUR TASK:
    Analyze this stock and provide specific trading recommendations. Think step-by-step about:
    1. What is the current market sentiment and momentum?
    2. What are the key technical levels (support/resistance)?
    3. What is the risk/reward ratio at current levels?
    4. What should the trade action be (BUY/SELL/HOLD)?
    5. What are SPECIFIC price targets based on ${current_price:.2f}?
    
    CRITICAL: Base all price targets on the CURRENT PRICE of ${current_price:.2f}
    - Entry Zone: Should be within ±2% of current price
    - Stop Loss: Should be 3-5% below entry for BUY, 3-5% above for SELL
    - Take Profit: Should be 5-10% from entry
    
    OUTPUT FORMAT (strict JSON):
    {{
        "action": "BUY" | "SELL" | "HOLD",
        "entry_zone": <float price>,
        "stop_loss": <float price>,
        "take_profit": <float price>,
        "confidence_score": <0.0 to 1.0>,
        "reasoning": "Detailed explanation of the trade setup"
    }}
    """
    
    # Add chart image if provided (multimodal capability)
    prompt_parts = [analysis_prompt]
    if chart_image:
        print("📸 [PRO] Processing chart image (multimodal analysis)...")
        image_bytes = await chart_image.read()
        prompt_parts.append(types.Part.from_bytes(image_bytes, "image/png"))
    
    # Generate with Thought Signatures enabled
    try:
        analysis_response = client.models.generate_content(
            model="gemini-3-pro-preview",  # DEEP model with reasoning
            contents=prompt_parts,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thought_signatures=True,  # 🔑 KEY FEATURE: Enable reasoning audit trail
                temperature=0.3,  # Lower temperature for more deterministic trading advice
            )
        )
    except Exception as e:
        raise HTTPException(500, f"Gemini Pro analysis failed: {e}")
    
    # ==========================================
    # STEP 4: EXTRACT THOUGHT SIGNATURES
    # ==========================================
    thought_chain: List[ThoughtStep] = []
    reasoning_audit_parts = []
    
    print(f"🔍 [AUDIT] Extracting thought signatures...")
    
    for candidate in analysis_response.candidates:
        step_num = 1
        for part in candidate.content.parts:
            # Extract thought signature if present
            if hasattr(part, 'thought') and part.thought:
                thought_step = ThoughtStep(
                    step_number=step_num,
                    thought=part.thought.text,
                    timestamp=datetime.now(timezone.utc).isoformat()
                )
                thought_chain.append(thought_step)
                reasoning_audit_parts.append(f"Step {step_num}: {part.thought.text}")
                step_num += 1
                print(f"  💭 Thought {step_num-1}: {part.thought.text[:80]}...")
    
    # Create human-readable audit trail
    reasoning_audit = "\n".join(reasoning_audit_parts) if reasoning_audit_parts else "No thought signatures captured (model may not have used them for this query)"
    
    # ==========================================
    # STEP 5: PARSE JSON RESPONSE
    # ==========================================
    json_data = {}
    
    for candidate in analysis_response.candidates:
        for part in candidate.content.parts:
            if part.text:
                try:
                    # Clean potential markdown formatting
                    clean_text = part.text.replace("```json", "").replace("```", "").strip()
                    json_data = json.loads(clean_text)
                    print(f"✅ [PARSE] Successfully parsed analysis response")
                    break
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON parse error: {e}")
                    continue
    
    if not json_data:
        raise HTTPException(500, "Failed to parse AI response")
    
    # ==========================================
    # STEP 6: VALIDATE & BUILD RESPONSE
    # ==========================================
    
    # Validate price targets make sense
    action = json_data.get("action", "HOLD")
    entry = float(json_data.get("entry_zone", current_price))
    stop = float(json_data.get("stop_loss", current_price * 0.95))
    target = float(json_data.get("take_profit", current_price * 1.05))
    
    # Sanity check: for BUY, stop should be below entry
    if action == "BUY" and stop > entry:
        print(f"⚠️ Fixing invalid stop loss for BUY trade")
        stop = entry * 0.96
    
    # Sanity check: for SELL, stop should be above entry  
    if action == "SELL" and stop < entry:
        print(f"⚠️ Fixing invalid stop loss for SELL trade")
        stop = entry * 1.04
    
    print(f"✅ [COMPLETE] Analysis complete with {len(thought_chain)} thought steps")
    
    return StockTradePlan(
        ticker=ticker,
        action=action,
        entry_zone=str(entry),
        stop_loss=str(stop),
        take_profit=str(target),
        confidence_score=json_data.get("confidence_score", 0.5),
        reasoning_trace=json_data.get("reasoning", "Analysis completed"),
        current_price=current_price,
        
        # Multi-model metadata
        triage_model="gemini-3-flash",
        analysis_model="gemini-3-pro-preview",
        triage_sentiment=triage_text,
        
        # Thought signatures audit trail
        thought_chain=thought_chain,
        reasoning_audit=reasoning_audit
    )


@app.get("/get_news_trading_candidates", response_model=List[FundamentalCandidate])
async def get_news_trading_candidates(budget: float):
    print(f"📰 AI Scanning News Wires for catalysts under ${budget}...")

    prompt = f"""
    Act as a Financial News Analyst.
    TASK: Search for stocks or ETFs that are moving TODAY due to BREAKING NEWS.
    CONSTRAINTS: Share Price UNDER ${budget}. Exclude penny stocks < $2.00.
    OUTPUT: JSON List of 5 objects: [{{ "ticker": "AMD", "news_headline": "...", "sentiment": "Bullish" }}]
    """

    candidates_data = []
    
    try:
        response = client.models.generate_content(
            model="gemini-3-pro-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                response_mime_type="application/json"
            )
        )
        
        if response.candidates:
            candidate = response.candidates[0]
            for part in candidate.content.parts:
                if part.text:
                    try:
                        clean_text = part.text.replace("```json", "").replace("```", "").strip()
                        data = json.loads(clean_text)
                        if isinstance(data, list):
                            candidates_data = data
                    except:
                        continue
    except Exception as e:
        print(f"AI Search Error: {e}")
        return []

    final_output = []
    if not candidates_data:
        return []

    for item in candidates_data:
        ticker = item.get('ticker')
        try:
            stock = yf.Ticker(ticker)
            price = stock.fast_info.last_price
            
            if 2.0 < price <= budget:
                final_output.append(FundamentalCandidate(
                    ticker=ticker,
                    price=round(price, 2),
                    news_catalyst=item.get("news_headline", "News Catalyst"),
                    sentiment=item.get("sentiment", "Neutral")
                ))
        except Exception:
            continue

    return final_output[:10]


# ==========================================
# 📦 DATA MODELS - STRATEGY 1 (unchanged)
# ==========================================

class TradePlan(BaseModel):
    market_id: str
    event_ticker: str
    title: str
    category: str
    side: str
    entry_price: float
    exit_price: float
    stop_loss: float
    potential_profit_cents: float
    potential_loss_cents: float
    risk_reward_ratio: float
    expiry_time: Optional[str] = None
    hours_to_expiry: float
    is_0dte: bool
    fee_per_contract: float
    net_profit_after_fees: float
    settlement_source: str
    implied_win_rate: float
    suggested_contracts: int
    max_risk_dollars: float

class Strategy1Response(BaseModel):
    scan_time: str
    price_range: str
    categories: List[str]
    total_found: int
    trades: List[TradePlan]

# Legacy models
class StockTradePlan(BaseModel):
    ticker: str
    action: str
    entry_zone: str
    stop_loss: str
    take_profit: str
    confidence_score: float
    reasoning_trace: str
    current_price: float 

class ChartDataPoint(BaseModel):
    time: str
    price: float

class FundamentalCandidate(BaseModel):
    ticker: str
    price: float
    news_catalyst: str
    sentiment: str 

# ==========================================
# 🧮 UTILITY FUNCTIONS
# ==========================================

def calculate_kalshi_fee(price_cents: float) -> float:
    """Calculate Kalshi taker fee: 0.07 × P × (1-P)"""
    p = price_cents / 100
    fee = 0.07 * p * (1 - p) * 100
    return round(fee, 2)

def calculate_position_size(entry_price: float, stop_loss: float, bankroll: float = 1000, max_risk_pct: float = 0.02) -> tuple:
    """Calculate position size based on risk management"""
    risk_per_contract_cents = entry_price - stop_loss
    risk_per_contract_dollars = risk_per_contract_cents / 100
    max_risk_dollars = bankroll * max_risk_pct
    
    if risk_per_contract_dollars > 0:
        num_contracts = int(max_risk_dollars / risk_per_contract_dollars)
    else:
        num_contracts = 0
    
    num_contracts = min(num_contracts, 50)
    actual_risk = num_contracts * risk_per_contract_dollars
    
    return num_contracts, round(actual_risk, 2)

# ==========================================
# 🎯 STRATEGY 1 (From previous implementation)
# ==========================================

@app.get("/strategy1/scan", response_model=Strategy1Response)
async def scan_strategy1_opportunities(
    categories: str = Query("Crypto,Financial", description="Comma-separated: Crypto, Financial, Economics"),
    only_0dte: bool = Query(False, description="Only show contracts expiring today"),
    bankroll: float = Query(1000, description="Your bankroll for position sizing")
):
    """🎯 STRATEGY 1: Safe-Bet opportunities (88-98¢ range)"""
    print(f"🎯 Strategy 1 Scan: {STRATEGY_1_MIN_PRICE}-{STRATEGY_1_MAX_PRICE}¢")
    categories ="Crypto,Financial"
    only_0dte = False
    trades: List[TradePlan] = []
    category_list = [c.strip().upper() for c in categories.split(",")]
    
    CATEGORY_MAP = {
        "CRYPTO": ["CRYPTO", "CRYPTOCURRENCY"],
        "FINANCIAL": ["FINANCIAL", "FINANCE", "FINANCIALS"],
        "ECONOMICS": ["ECONOMICS", "ECONOMY"],
    }
    
    allowed_categories = set()
    for cat in category_list:
        for key, values in CATEGORY_MAP.items():
            if cat in values or cat == key:
                allowed_categories.update(values)
                allowed_categories.add(key)
    
    try:
        filtered_events = []
        current_url = f"{KALSHI_API_URL}/events?limit=200&status=open"
        
        while True:
            res = requests.get(current_url, timeout=15)
            if res.status_code != 200:
                break
            
            data = res.json()
            events = data.get("events", [])
            cursor = data.get("cursor", "")
            
            for e in events:
                cat = e.get("category", "").upper()
                if cat in allowed_categories:
                    print("in")
                    filtered_events.append({
                        "ticker": e.get("event_ticker"),
                        "category": e.get("category"),
                    })
                
            if cursor == "":
                break
            
            current_url = f"{KALSHI_API_URL}/events?limit=200&status=open&cursor={cursor}"
        
        for event_info in filtered_events:
            et = event_info["ticker"]
            if not et:
                continue
            
            try:
                detail_res = requests.get(f"{KALSHI_API_URL}/events/{et}", timeout=10)
                if detail_res.status_code != 200:
                    continue
                
                detail_data = detail_res.json()
                event_data = detail_data.get('event', {})
                markets = detail_data.get('markets', [])
                
                for m in markets:

                    test = m.get('title')
                    yes_ask = m.get('yes_ask') or 0
                    no_ask = m.get('no_ask') or 0
                
                    if 0 < yes_ask <= 1:
                        yes_ask = int(yes_ask * 100)
                    if 0 < no_ask <= 1:
                        no_ask = int(no_ask * 100)
                    
                    selected_side = None
                    entry_price = 0
                    
                    if STRATEGY_1_MIN_PRICE <= yes_ask <= STRATEGY_1_MAX_PRICE:
                        selected_side = "YES"
                        entry_price = yes_ask
                        print("YES")
                    elif STRATEGY_1_MIN_PRICE <= no_ask <= STRATEGY_1_MAX_PRICE:
                        selected_side = "NO"
                        entry_price = no_ask
                        print("NO")
                    if not selected_side:
                        continue
                    
                    expiry_time = m.get('close_time') or m.get('expiration_time')
                    
                    try:
                        expiry = datetime.fromisoformat(expiry_time.replace('Z', '+00:00'))
                        now = datetime.now(timezone.utc)
                        hours_to_exp = max(0, (expiry - now).total_seconds() / 3600)
                        is_zero_dte = expiry.date() == now.date()
                    
                    except:
                        hours_to_exp = 24
                        is_zero_dte = False
                    
                    if only_0dte and not is_zero_dte:
                        continue
                    
                    stop_loss = max(1, round(entry_price * 0.5 if is_zero_dte else entry_price * 0.4))
                    potential_profit = 100 - entry_price
                    potential_loss = entry_price - stop_loss
                    rr_ratio = potential_profit / potential_loss if potential_loss > 0 else 0
                    
                    fee = calculate_kalshi_fee(entry_price)
                    net_profit = potential_profit - fee
                    
                    num_contracts, max_risk = calculate_position_size(entry_price, stop_loss, bankroll)
                    
                    trade = TradePlan(
                        market_id=m.get('ticker', ''),
                        event_ticker=et,
                        title=m.get('title', ''),
                        category=event_info.get("category", ""),
                        side=selected_side,
                        entry_price=entry_price,
                        exit_price=100,
                        stop_loss=stop_loss,
                        potential_profit_cents=potential_profit,
                        potential_loss_cents=potential_loss,
                        risk_reward_ratio=round(rr_ratio, 2),
                        expiry_time=expiry_time,
                        hours_to_expiry=round(hours_to_exp, 2),
                        is_0dte=is_zero_dte,
                        fee_per_contract=fee,
                        net_profit_after_fees=round(net_profit, 2),
                        settlement_source=event_data.get('settlement_source_url', 'Kalshi'),
                        implied_win_rate=entry_price,
                        suggested_contracts=num_contracts,
                        max_risk_dollars=max_risk
                    )
                    
                    trades.append(trade)
                    
            except Exception as e:
                continue
        
    except Exception as e:
        print(f"❌ Strategy 1 Error: {e}")
    
    trades.sort(key=lambda x: (x.hours_to_expiry, -x.net_profit_after_fees))
    
    return Strategy1Response(
        scan_time=datetime.now(timezone.utc).isoformat(),
        price_range=f"{STRATEGY_1_MIN_PRICE}-{STRATEGY_1_MAX_PRICE}¢",
        categories=list(allowed_categories),
        total_found=len(trades),
        trades=trades
    )

class ThoughtStep(BaseModel):
    """Individual reasoning step from Gemini's thought process"""
    step_number: int
    thought: str
    timestamp: str
    search_query: Optional[str] = None  # If this step triggered a search

class Strategy1VerifiedTrade(BaseModel):
    """Enhanced with Thought Signatures audit trail"""
    trade: TradePlan
    source_name: str
    source_url: str
    source_data: str
    kalshi_rule: str
    current_value: Optional[str] = None
    threshold: Optional[str] = None
    distance_to_threshold: Optional[str] = None
    ai_true_probability: float
    market_implied_probability: float
    edge: float
    recommendation: str  # "EXECUTE" | "SKIP" | "WAIT"
    confidence: str  # "HIGH" | "MEDIUM" | "LOW"
    reasoning: str
    risk_factors: List[str]
    time_sensitivity: str
    adjusted_contracts: int
    adjusted_risk_dollars: float
    
    # NEW: Thought Signatures & Multi-Model Orchestration
    verification_model: str = "gemini-3-pro-preview"
    thought_chain: List[ThoughtStep] = []
    reasoning_audit: str = ""
    web_searches_performed: int = 0

class Strategy1VerifyResponse(BaseModel):
    """Response for Strategy 1 verification"""
    scan_time: str
    total_scanned: int
    top_opportunities: List[Strategy1VerifiedTrade]
    summary: str


async def verify_strategy1_trade(trade: TradePlan) -> Strategy1VerifiedTrade:
    """
    🚀 ENHANCED VERIFICATION WITH GEMINI 3 THOUGHT SIGNATURES
    
    This is the MAIN DEMO FEATURE for the hackathon.
    
    Process:
    1. Extract settlement source from Kalshi market
    2. Use Gemini 3 Pro + Thought Signatures to:
       - Determine which data source to check (CoinGecko, Yahoo Finance, BLS, etc.)
       - Use Google Search to retrieve current real-world data
       - Compare to Kalshi's resolution threshold
       - Calculate true probability vs market price
       - Compute edge and make recommendation
    3. Capture complete reasoning chain via Thought Signatures
    4. Return full audit trail for transparency
    
    This demonstrates:
    ✅ Agentic multi-step reasoning
    ✅ Real-time web search grounding
    ✅ Thought Signatures for explainable AI
    ✅ Protecting users from mispriced markets
    """
    
    print(f"🔍 [VERIFY] Starting enhanced verification for: {trade.title[:60]}...")
    
    if not client:
        raise HTTPException(500, "Gemini client not initialized")
    
    # ==========================================
    # STEP 1: BUILD VERIFICATION PROMPT
    # ==========================================
    
    verification_prompt = f"""
You are a quantitative analyst verifying prediction market opportunities.

MARKET DETAILS:
- Title: {trade.title}
- Settlement Source: {trade.settlement_source}
- Current Market Price: {trade.entry_price}¢ for {trade.side}
- Market Implied Probability: {trade.implied_win_rate:.1f}%
- Time to Expiry: {trade.hours_to_expiry:.1f} hours

YOUR TASK - THINK STEP BY STEP:

Step 1: Identify the official data source
- For Crypto: Use CoinGecko, CoinMarketCap, or Coinbase
- For Stocks: Use Yahoo Finance or Google Finance  
- For Economics: Use Federal Reserve, BLS, or Treasury
- For Weather: Use NOAA or Weather.gov

Step 2: Use Google Search to find the CURRENT value
- Search for the latest data point
- Verify from multiple sources if possible
- Extract the exact current value

Step 3: Extract the threshold from the settlement rule
- Parse "{trade.settlement_source}" carefully
- Identify the exact threshold or condition

Step 4: Calculate the true probability
- Based on current value and threshold
- Consider time remaining and volatility
- Be conservative in your estimate

Step 5: Calculate edge and make recommendation
- Edge = True Probability - Market Implied Probability
- If edge >= 5%: EXECUTE
- If edge 0-5%: WAIT (marginal edge)
- If edge < 0%: SKIP (overpriced)

Step 6: Identify risk factors
- Data freshness concerns?
- Volatility in the metric?
- Time-sensitive factors?

OUTPUT STRICT JSON:
{{
    "source_name": "Official source name",
    "source_url": "URL of the data source",
    "source_data": "Exact current value with units",
    "kalshi_rule": "The settlement condition from Kalshi",
    "current_value": "Current value (number only)",
    "threshold": "Threshold value (number only)",
    "distance_to_threshold": "How far from threshold (with direction)",
    "ai_true_probability": <float 0-100>,
    "edge": <float, can be negative>,
    "recommendation": "EXECUTE" | "WAIT" | "SKIP",
    "confidence": "HIGH" | "MEDIUM" | "LOW",
    "reasoning": "Clear explanation of the analysis",
    "risk_factors": ["risk 1", "risk 2", ...],
    "time_sensitivity": "Description of time urgency"
}}
"""
    
    # ==========================================
    # STEP 2: CALL GEMINI 3 PRO WITH THOUGHT SIGNATURES + GOOGLE SEARCH
    # ==========================================
    
    print(f"🧠 [PRO] Activating Thought Signatures + Google Search...")
    
    try:
        response = client.models.generate_content(
            model="gemini-3-pro-preview",
            contents=verification_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(
                    include_thoughts=True
                ),
                temperature=0.2,  # Lower temp for more deterministic verification
                tools=[
                    types.Tool(
                        google_search=types.GoogleSearch()  # 🔍 Enable web search
                    )
                ]
            )
        )
    except Exception as e:
        print(f"❌ [PRO] Verification failed: {e}")
        raise HTTPException(500, f"Verification failed: {e}")
    
    # ==========================================
    # STEP 3: EXTRACT THOUGHT SIGNATURES
    # ==========================================
    
    thought_chain: List[ThoughtStep] = []
    reasoning_audit_parts = []
    web_searches = 0
    
    print(f"🔍 [AUDIT] Extracting thought signatures and search queries...")
    
    for candidate in response.candidates:
        step_num = 1
        for part in candidate.content.parts:
            
            # Check if this part is a thought (boolean flag check)
            if hasattr(part, 'thought') and part.thought:
                # ✅ FIX: Use part.text, not part.thought.text
                thought_text = part.text
                
                # Check if this thought triggered a search
                search_query = None
                if "search for" in thought_text.lower() or "google" in thought_text.lower():
                    search_query = thought_text
                    web_searches += 1
                
                thought_step = ThoughtStep(
                    step_number=step_num,
                    thought=thought_text,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    search_query=search_query
                )
                thought_chain.append(thought_step)
                
                search_indicator = " [🔍 Search]" if search_query else ""
                reasoning_audit_parts.append(f"Step {step_num}{search_indicator}: {thought_text}")
                
                print(f"  💭 Thought {step_num}{search_indicator}: {thought_text[:100]}...")
                step_num += 1
            
            # Extract search results (if available)
            if hasattr(part, 'executable_code') and part.executable_code:
                print(f"  🔍 Search executed: {part.executable_code.language}")
    
    reasoning_audit = "\n".join(reasoning_audit_parts) if reasoning_audit_parts else "Standard verification (no explicit thoughts captured)"
    
    print(f"✅ [AUDIT] Captured {len(thought_chain)} reasoning steps, {web_searches} web searches")
    
    # ==========================================
    # STEP 4: PARSE JSON RESPONSE
    # ==========================================
    
    result = {}
    
    for candidate in response.candidates:
        for part in candidate.content.parts:
            if part.text:
                try:
                    clean_text = part.text.replace("```json", "").replace("```", "").strip()
                    result = json.loads(clean_text)
                    print(f"✅ [PARSE] Successfully parsed verification response")
                    break
                except json.JSONDecodeError as e:
                    print(f"⚠️ JSON parse error: {e}")
                    continue
    
    if not result:
        raise HTTPException(500, "Failed to parse verification response")
    
    # ==========================================
    # STEP 5: CALCULATE EDGE & VALIDATE
    # ==========================================
    
    ai_prob = result.get("ai_true_probability", 50.0)
    market_prob = trade.implied_win_rate
    edge = ai_prob - market_prob
    
    # Update edge in result if it's wrong
    result["edge"] = edge
    
    # Validate recommendation matches edge
    if edge >= 5 and result["recommendation"] != "EXECUTE":
        print(f"⚠️ Correcting recommendation: edge {edge:.1f}% should be EXECUTE")
        result["recommendation"] = "EXECUTE"
    elif edge < 0 and result["recommendation"] != "SKIP":
        print(f"⚠️ Correcting recommendation: edge {edge:.1f}% should be SKIP")
        result["recommendation"] = "SKIP"
    
    # Position sizing based on confidence and edge
    base_contracts = trade.suggested_contracts
    
    if result["confidence"] == "HIGH" and edge >= 10:
        adjusted_contracts = int(base_contracts * 1.5)  # Increase position
    elif result["confidence"] == "LOW" or edge < 3:
        adjusted_contracts = int(base_contracts * 0.5)  # Reduce position
    else:
        adjusted_contracts = base_contracts
    
    adjusted_risk = adjusted_contracts * trade.max_risk_dollars / base_contracts
    
    print(f"✅ [COMPLETE] Verification complete: {result['recommendation']} | Edge: {edge:.1f}% | Confidence: {result['confidence']}")
    
    # ==========================================
    # STEP 6: BUILD ENHANCED RESPONSE
    # ==========================================
    
    return Strategy1VerifiedTrade(
        trade=trade,
        source_name=result.get("source_name", "Unknown"),
        source_url=result.get("source_url", ""),
        source_data=result.get("source_data", ""),
        kalshi_rule=result.get("kalshi_rule", trade.settlement_source),
        current_value=result.get("current_value"),
        threshold=result.get("threshold"),
        distance_to_threshold=result.get("distance_to_threshold"),
        ai_true_probability=ai_prob,
        market_implied_probability=market_prob,
        edge=edge,
        recommendation=result.get("recommendation", "WAIT"),
        confidence=result.get("confidence", "MEDIUM"),
        reasoning=result.get("reasoning", ""),
        risk_factors=result.get("risk_factors", []),
        time_sensitivity=result.get("time_sensitivity", "Unknown"),
        adjusted_contracts=adjusted_contracts,
        adjusted_risk_dollars=adjusted_risk,
        
        # Enhanced metadata
        verification_model="gemini-3-pro-preview",
        thought_chain=thought_chain,
        reasoning_audit=reasoning_audit,
        web_searches_performed=web_searches
    )



@app.get("/strategy1/verify_top3", response_model=Strategy1VerifyResponse)
async def verify_top3_strategy1(
    categories: str = Query("Crypto,Financial", description="Categories to scan"),
    only_0dte: bool = Query(True, description="Only 0DTE contracts"),
    bankroll: float = Query(1000, description="Bankroll for position sizing")
):
    """
    🏆 Find and verify the TOP 3 most profitable Strategy 1 opportunities
    
    Process:
    1. Scan all Strategy 1 opportunities
    2. Use Gemini AI + Google Search to verify each one
    3. Rank by: AI confidence + edge + profit potential
    4. Return top 3 with full verification data
    
    This is the main endpoint for finding the best trades!
    """
    print(f"🏆 Finding Top 3 Strategy 1 Opportunities...")
    
    # Step 1: Get all opportunities
    scan_response = await scan_strategy1_opportunities(categories, only_0dte, bankroll)
    trades = scan_response.trades
    
    if not trades:
        return Strategy1VerifyResponse(
            scan_time=datetime.now(timezone.utc).isoformat(),
            total_scanned=0,
            top_opportunities=[],
            summary="No opportunities found in the current scan."
        )
    
    print(f"📊 Found {len(trades)} trades to analyze")
    
    # Step 2: Verify each trade (limit to first 10 to avoid rate limits)
    verified_trades: List[Strategy1VerifiedTrade] = []
    trades_to_verify = trades[:3]  # Limit to avoid rate limits
    
    for i, trade in enumerate(trades_to_verify):
        print(f"🔍 Verifying {i+1}/{len(trades_to_verify)}: {trade.title[:50]}...")
        verified = await verify_strategy1_trade(trade)
        verified_trades.append(verified)
        time.sleep(1)  # Rate limit protection
    
    if not verified_trades:
        return Strategy1VerifyResponse(
            scan_time=datetime.now(timezone.utc).isoformat(),
            total_scanned=len(trades),
            top_opportunities=[],
            summary="Verification failed for all trades."
        )
    
    # Step 3: Score and rank trades
    def score_trade(vt: Strategy1VerifiedTrade) -> float:
        """Score a trade based on multiple factors"""
        score = 0
        
        # Edge contribution (most important)
        score += vt.edge * 3
        
        # Confidence contribution
        if vt.confidence == "HIGH":
            score += 20
        elif vt.confidence == "MEDIUM":
            score += 10
        
        # Recommendation contribution
        if vt.recommendation == "EXECUTE":
            score += 30
        elif vt.recommendation == "WAIT":
            score += 5
        
        # Profit potential
        score += vt.trade.net_profit_after_fees * 0.5
        
        # Time urgency bonus (0DTE gets bonus)
        if vt.trade.is_0dte:
            score += 10
        
        return score
    
    # Sort by score descending
    verified_trades.sort(key=lambda x: score_trade(x), reverse=True)
    
    # Get top 3
    top_3 = verified_trades[:3]
    
    # Build summary
    execute_count = sum(1 for vt in top_3 if vt.recommendation == "EXECUTE")
    avg_edge = sum(vt.edge for vt in top_3) / len(top_3) if top_3 else 0
    
    summary = f"Analyzed {len(verified_trades)} trades. "
    summary += f"Top 3 have avg edge of {avg_edge:.1f}%. "
    summary += f"{execute_count}/3 recommended for execution."
    
    if top_3 and top_3[0].recommendation == "EXECUTE":
        summary += f" Best opportunity: {top_3[0].trade.title[:40]}... with {top_3[0].edge:.1f}% edge."
    
    print(f"✅ Top 3 identified: {[vt.trade.title[:30] for vt in top_3]}")
    
    return Strategy1VerifyResponse(
        scan_time=datetime.now(timezone.utc).isoformat(),
        total_scanned=len(trades),
        top_opportunities=top_3,
        summary=summary
    )


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
