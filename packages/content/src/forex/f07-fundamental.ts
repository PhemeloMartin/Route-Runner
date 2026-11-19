import { chapter } from '../dsl.js';

export default chapter`
@chapter forex.f07 | Fundamental Analysis: Rates, Data, News and the Rand | 7
@story
At 15:30 on a Friday the chart explodes: USD/ZAR jumps 1,200 pips in two minutes. "What happened?" Phemelo gasps. Thabang taps the economic calendar: "US jobs data. Charts show you WHERE price is. Fundamentals tell you WHY it moves - and WHEN to step aside."

=== lesson f07-1 | Central Banks, Interest Rates and Inflation | 25
@analogy A central bank is the economy's thermostat. When the economy runs too hot (high inflation) it turns up interest rates to cool things down; when it's too cold (recession) it lowers them. Currencies react to every hint about which way the dial will turn.
@objectives
- Explain how central banks set policy and why markets care
- Explain the link between inflation, interest rates and currencies
- Understand "priced in" and surprises
@body
The most important drivers of major currencies are **central banks**:
- **US Federal Reserve (Fed)** - FOMC meets 8 times a year; the world's most influential
- **European Central Bank (ECB)**, **Bank of England (BoE)**, **Bank of Japan (BoJ)**
- **South African Reserve Bank (SARB)** - its **Monetary Policy Committee** sets the **repo rate**, aiming for low and stable inflation (SA's target has been 3-6%, and the SARB has been moving towards a lower 3% point target - check the latest)

**The chain:** inflation rising -> central bank signals higher rates (**hawkish**) -> higher yields attract capital -> currency tends to strengthen. Slowing economy -> cuts (**dovish**) -> currency tends to weaken.

**Markets trade expectations, not facts.** If everyone expects a 0.25% hike, it's already **"priced in"** - the currency may barely move or even fall when it happens ("buy the rumour, sell the fact"). The big moves come from **surprises** versus the forecast, and from changes in **forward guidance** (hints about future decisions).

**Inflation data (CPI)** matters because it shapes those expectations. A higher-than-expected US CPI can strengthen the dollar instantly as traders price in a more hawkish Fed.
@terms
- Central bank :: Institution that sets interest rates and manages a currency (Fed, ECB, SARB)
- Repo rate :: SARB's key policy interest rate
- Hawkish / dovish :: Leaning towards higher rates / lower rates
- CPI :: Consumer Price Index - the main measure of inflation
- Priced in :: Already reflected in prices because the market expected it
- Forward guidance :: Central bank hints about future policy
@pro
- "Markets move on the surprise versus expectations, not on the number itself."
@quiz
? A central bank signals more rate hikes ahead. Its tone is...
+ hawkish
- dovish
- neutral by definition
- bearish for inflation data
> Hawk = higher rates.
? Everyone expected a rate cut and it happened. The currency barely moved. Why?
+ The cut was already priced in
- The data was fake
- Markets were closed
- Rate cuts never matter
> Expectations already reflected.
? What does the SARB's MPC decide?
+ South Africa's repo rate
- Tax rates
- Broker licences
- The petrol price only
> Monetary policy.

=== lesson f07-2 | The Economic Calendar and High-Impact News | 20
@analogy The economic calendar is the fixture list for the market's big matches. You wouldn't walk onto a rugby field during a Springbok game; a beginner shouldn't hold a tight-stop trade into NFP.
@objectives
- Use an economic calendar (actual vs forecast vs previous)
- Identify the highest-impact releases
- Build a simple news rule for beginners
@body
An **economic calendar** lists upcoming releases with **forecast**, **previous** and, after release, **actual** values plus an impact rating.

**High-impact releases to know:**
- **US Non-Farm Payrolls (NFP)** + unemployment rate - first Friday, 14:30/15:30 SAST
- **US CPI** inflation, **FOMC** rate decisions and press conferences (usually around 20:00/21:00 SAST)
- ECB, BoE, BoJ rate decisions; Eurozone and UK CPI
- **GDP**, retail sales, PMIs (business surveys)
- **South Africa:** SARB MPC decisions, SA CPI, GDP, the Budget speech, credit-rating reviews (Moody's, S&P, Fitch)

**What happens at release:** spreads widen sharply, price can whip both ways within seconds, and stop-losses can **slip**.

**Beginner news rule (Route Runner default):** check the calendar every morning; **no new trades 30 minutes before to 30 minutes after high-impact news** for the currencies you trade; reduce size or close short-term trades before major events. Swing traders can hold through news if their stop is wide and position size small.
@terms
- Economic calendar :: Schedule of upcoming economic releases with forecasts
- Actual vs forecast :: The released number compared with expectations - the surprise moves price
- FOMC :: Federal Open Market Committee - sets US interest rates
- PMI :: Purchasing Managers' Index - survey of business activity (above 50 = expansion)
- High-impact news :: Releases that typically cause large, fast price moves
@pro
- "I check the economic calendar before every session and stay flat around high-impact releases."
@quiz
? Which release typically moves USD the most on the first Friday of the month?
+ Non-Farm Payrolls
- Japanese tourism data
- Weekly retail fuel prices
- Ski resort bookings
> Non-Farm Payrolls (US jobs report) is released on the first Friday and usually moves USD the most.
? What usually happens to spreads right at a major news release?
+ They widen sharply
- They become zero
- They disappear for the day
- They shrink to nothing
> Liquidity thins.
? A PMI reading of 54 suggests...
+ the sector is expanding
- the sector is contracting
- a recession is confirmed
- inflation is zero
> Above 50 = expansion.

=== lesson f07-3 | What Moves the Rand | 20
@analogy The rand is a small boat on a big ocean. Global waves (US rates, world risk mood, China) toss it around the most; local weather (load-shedding, politics, SARB) decides whether it sails smoothly or leaks.
@objectives
- List the global and local drivers of ZAR
- Explain why USD/ZAR is volatile
- Connect commodities and risk sentiment to the rand
@body
**Global drivers (often the biggest):**
- **US interest rates and the dollar** - a stronger dollar usually means a weaker rand
- **Global risk sentiment** - risk-off (wars, crises, market crashes) -> investors sell emerging markets -> rand weakens. Risk-on -> rand strengthens.
- **China's economy** - SA's major trading partner and buyer of commodities
- **Commodity prices** - gold, platinum group metals, coal, iron ore. Higher prices support SA exports and the rand.

**Local drivers:**
- **SARB policy** and inflation (the interest-rate differential attracts carry-trade flows)
- **Electricity supply (load-shedding)** and logistics (Transnet ports and rail) - growth and investor confidence
- **Politics and policy** - elections, coalition stability, the Budget, state-owned-enterprise finances
- **Credit ratings** - downgrades can force some funds to sell SA bonds
- **Current account and trade balance**

**Why it's volatile:** the rand is very liquid for an emerging-market currency, so global investors use it as a proxy to express views on "emerging markets" generally - it moves on news from everywhere. As a trader that means opportunity **and** danger: size USD/ZAR positions smaller than majors and use ATR-based stops.
@terms
- Emerging-market currency :: Currency of a developing economy - usually more volatile
- Commodity currency :: Currency sensitive to commodity export prices (ZAR, AUD, CAD)
- Credit rating :: Agencies' assessment of a government's ability to repay debt
- Current account :: Balance of trade, income and transfers with the rest of the world
@pro
- "The rand often trades as a proxy for global emerging-market risk, so I watch US yields and risk sentiment, not just local news."
@quiz
? Gold and platinum prices rise sharply. All else equal, the rand tends to...
+ strengthen
- weaken
- stay fixed
- stop trading
> Better export earnings.
? A global market panic usually makes USD/ZAR...
+ rise (weaker rand)
- fall (stronger rand)
- freeze
- convert to EUR/ZAR
> In a panic investors sell emerging-market currencies like the rand and buy dollars, so USD/ZAR rises.
? Why size USD/ZAR positions smaller than EUR/USD?
+ It is far more volatile, with wider spreads
- It has no pips
- It's illegal to trade large
- It never moves
> Volatility and costs.

=== boss
? US CPI comes in much HIGHER than forecast. A likely first reaction?
+ USD strengthens as markets expect a more hawkish Fed
- USD weakens because inflation is bad
- No reaction - CPI never matters
- Only the rand moves
> Surprise -> expectations shift.
? Which is a local driver of the rand?
+ Load-shedding and SARB policy
- Japanese retail sales
- The Swiss ski season
- Australian rainfall
> Domestic factors.
? A beginner's best approach to high-impact news is...
+ avoid opening new trades just before and after it
- trade the release with maximum size
- remove all stop-losses
- trade only during news
> Protect yourself from slippage.
? "Buy the rumour, sell the fact" describes...
+ prices moving on expectations before an event, then reversing when it happens
- buying after every fact is released
- illegal insider trading
- swap calculations
> Priced-in dynamics.
`;
