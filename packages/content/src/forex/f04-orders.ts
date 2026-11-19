import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f04 | Orders, Platforms and Trading Sessions | 4
@story
"Clicking BUY is the easiest part," says Thabang. "Professionals decide where they're WRONG before they click - and put that in the order. Today you learn every order type, the platforms, and when the market is actually awake in South African time."
@lab trading:floor | Place your first demo trade (with a stop-loss!)

=== lesson f04-1 | Market, Limit and Stop Orders; Stop-Loss and Take-Profit | 25
@analogy A market order is buying at whatever the shop charges right now. A limit order is telling the shop "call me if it drops to R100". A stop-loss is a fire-escape plan written before the fire.
@objectives
- Use market, limit and stop entry orders
- Place stop-loss and take-profit correctly for longs and shorts
- Understand slippage and trailing stops
@body
**Entry orders:**
- **Market order** - fill now at the best available price (buy at ask, sell at bid).
- **Buy limit** - buy **below** the current price (waiting for a pullback to support).
- **Sell limit** - sell **above** the current price (at resistance).
- **Buy stop** - buy **above** the current price (breakout).
- **Sell stop** - sell **below** the current price (breakdown).

**Exit orders - attach them to EVERY trade:**
- **Stop-loss (SL)** - closes the trade at a loss you've pre-defined. For a **buy**, the SL is **below** entry; for a **sell**, **above** entry.
- **Take-profit (TP)** - closes at your target. Buy: TP above entry; sell: TP below.
- **Trailing stop** - an SL that follows price by a set distance to lock in profit.

**Slippage** - in fast markets (news, Monday gaps) your order fills at a worse price than requested. Stop-losses become market orders when hit, so they can slip - a reason to avoid trading right into major news as a beginner.

The Route Runner order ticket rejects a buy with its stop above entry - just like a real platform. Try it.
@terms
- Market order :: Executes immediately at the current price
- Limit order :: Buy below / sell above the current price
- Stop order :: Buy above / sell below the current price (breakouts)
- Stop-loss :: Order that closes a losing trade at a pre-set level
- Take-profit :: Order that closes a winning trade at a target
- Trailing stop :: Stop-loss that moves with price to lock in profit
- Slippage :: Getting filled at a different price than requested
@pro
- "I place the stop-loss where my trade idea is proven wrong, then size the position from that distance."
@quiz
? You BUY EUR/USD at 1.0850. Where must the stop-loss be?
+ Below 1.0850
- Above 1.0850
- At 1.0850
- Stops aren't allowed on buys
> Longs lose when price falls.
? You want to buy only if price drops back to support at 1.0800 (now 1.0850). Which order?
+ Buy limit at 1.0800
- Buy stop at 1.0800
- Market buy
- Sell limit
> Buy limit = below current price.
? Your stop-loss filled 15 pips worse than set during a news release. This is...
+ slippage
- a swap
- a spread rebate
- a margin call
> Fast markets slip.

=== lesson f04-2 | Trading Platforms and Choosing Timeframes | 20
@analogy Timeframes are zoom levels on a map. The weekly chart is the satellite view of the country, the daily chart shows the province, the hourly chart the town, the 1-minute chart one street. You plan the trip from far away and only zoom in to park.
@objectives
- Know the common platforms (MT4/MT5, cTrader, TradingView)
- Choose timeframes that fit your life and style
@body
**Platforms:** **MetaTrader 4/5** (most common with brokers), **cTrader**, broker web/mobile apps, and **TradingView** for charting and analysis. All have the same core: chart, order ticket, positions, history, and a **demo mode** - always learn a platform on demo first.

**Trading styles and timeframes:**
| Style | Holds for | Main charts | Time needed |
|---|---|---|---|
| Scalping | seconds-minutes | M1-M5 | hours glued to screen; costs matter most |
| Day trading | minutes-hours | M15-H1 | daily sessions; closes before night |
| **Swing trading** | **days-weeks** | **H4-D1** | **30-60 min a day - fits a student/worker** |
| Position trading | weeks-months | D1-W1 | lowest; fundamentals matter |

**Multi-timeframe analysis:** decide the **trend on a higher timeframe** (weekly/daily), look for an **entry on a lower one** (H4/H1). Trading against the higher-timeframe trend is swimming upstream.

The Route Runner Trading Floor uses **daily and weekly** candles built from real ECB data - perfect for learning swing trading, the style that fits around studying and a job.
@terms
- MetaTrader (MT4/MT5) :: The most widely used retail forex platform
- Timeframe :: How much time each candle represents (M1, H1, D1, W1)
- Swing trading :: Holding trades for days to weeks
- Multi-timeframe analysis :: Higher timeframe for direction, lower for entry
@pro
- "I take direction from the daily chart and time entries on the four-hour."
@quiz
? Which style best suits someone with a full-time job or studies?
+ Swing trading on H4/daily charts
- 1-minute scalping
- Trading every news release
- High-frequency trading
> Fewer decisions, less screen time.
? On a D1 chart each candle represents...
+ one day
- one minute
- one hour
- one week
> D1 = one day per candle; H1 = one hour; W1 = one week.
? In multi-timeframe analysis, the higher timeframe is used for...
+ the overall direction/trend
- exact entry timing only
- calculating swaps
- choosing a broker
> Big picture first.

=== lesson f04-3 | Market Sessions in South African Time | 20
@analogy The forex day is a relay race across time zones. Sydney passes the baton to Tokyo, Tokyo to London, London to New York. The fastest leg - when two runners are on the track together - is the London/New York overlap in your late afternoon.
@objectives
- Know the session times in SAST
- Identify the most liquid times and when to avoid trading
@body
Approximate session times in **South African Standard Time** (SAST, UTC+2 - SA has no daylight saving; times shift 1 hour when Europe or the US change clocks):
| Session | SAST | Character |
|---|---|---|
| Sydney | 00:00 - 09:00 | quiet; AUD/NZD |
| Tokyo | 02:00 - 11:00 | JPY pairs active |
| **London** | **10:00 - 19:00** | biggest session; EUR, GBP, CHF |
| **New York** | **15:00 - 24:00** | USD news; big moves |

**London/New York overlap - roughly 15:00-19:00 SAST** - highest liquidity and tightest spreads for majors. Very convenient for South Africans!

**USD/ZAR** is most active in the London and New York sessions, and around SA data (SARB rate decisions, CPI, GDP, budget speeches).

**Times to be careful:** **US jobs report (NFP)** - first Friday of the month, **14:30 or 15:30 SAST** (depends on US daylight saving); **FOMC** decisions (usually 20:00 or 21:00 SAST); **Monday open** (gaps); **late Friday** (thin liquidity); public holidays (Christmas, US holidays). Spreads widen around rollover (~23:00-00:00 SAST).

The Trading Floor's clock shows which sessions are open right now.
@terms
- SAST :: South African Standard Time (UTC+2), no daylight saving
- Session overlap :: Period when two major sessions are open together - higher liquidity
- NFP :: US Non-Farm Payrolls jobs report - first Friday of the month
- Liquidity :: How easily you can trade without moving the price; high liquidity = tight spreads
@pro
- "The London-New York overlap, about 15:00 to 19:00 SAST, is the most liquid part of the day."
@quiz
? Which period usually has the highest liquidity for major pairs?
+ London-New York overlap (about 15:00-19:00 SAST)
- Sydney session alone
- Saturday morning
- 23:30 SAST rollover
> Two big centres open.
? When is the US NFP report released?
+ First Friday of the month, 14:30 or 15:30 SAST
- Every Monday at 09:00
- Last day of the year
- Every Wednesday night
> 8:30 New York time.
? Why can Monday's open be dangerous?
+ Prices can gap on weekend news
- Spreads are zero
- Brokers are closed
- Swaps are tripled
> Gaps skip stop-losses.

=== boss
? You SELL USD/ZAR at 17.2000. Which is a valid take-profit?
+ 17.0500
- 17.3500
- 17.2000
- 18.0000
> Shorts profit when price falls.
? Price is 1.2650. You want to buy only if it breaks above 1.2700. Which order?
+ Buy stop at 1.2700
- Buy limit at 1.2700
- Sell stop at 1.2700
- Market buy now
> Buy stop above the market.
? Which should be on EVERY trade?
+ A stop-loss
- Maximum leverage
- A news release
- A second account
> Defined risk.
? Which session is the largest by volume?
+ London
- Sydney
- Tokyo
- Wellington
> London dominates FX turnover.
`;
