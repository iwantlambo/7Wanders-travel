# Technical Finance Curriculum for UK Investment Banking: from zero to interview-ready (and analyst-ready)

> **Method note for the report writer.** In this environment, direct page fetching (WebFetch and curl) was blocked by DNS and egress policy for every finance site tried (wallstreetprep.com, breakingintowallstreet.com, mergersandinquisitions.com, ifrs.org, kpmg.com, pages.stern.nyu.edu). So every citation below comes from the search engine's summary of the linked page, not from reading the full page. The formulas were checked against at least two independent search-result sources each. They agree with standard textbook treatment. All £ worked examples are my own arithmetic, built from the cited formulas and checked in Python. They appear under "Inferences" and are labelled "derived". The UK corporation tax main rate of 25% is used throughout. Source quality varies. Wall Street Prep (WSP), Breaking Into Wall Street (BIWS), CFI, F&E Training (Felix), Damodaran/NYU, KPMG, Deloitte, IAS Plus, AnalystPrep (CFA notes), Big-4 and law-firm briefings are treated as reputable. Interview-prep aggregators (ibinterviewquestions.com, superdayai.com, acadifi.com, fffinstill.com, vectorshift.ai, hebbia.com, ryanoconnellfinance.com) look partly AI-generated, so they are only used where another source corroborates them, or are flagged where not.

---

## 1. Accounting: the three statements, the links between them, line-item walk-throughs, working capital, deferred tax, and the IFRS vs US GAAP points that matter in the UK

### Takeaway
Net income is the hinge. It closes into retained earnings on the balance sheet (BS) and is the first line of the indirect cash flow statement (CFS). Non-cash items (D&A, impairments) and working-capital movements reconcile it to cash, and ending cash closes back into the BS. A UK or European candidate must also know four IFRS points. IFRS 16 puts virtually all leases on balance sheet, which raises EBITDA and net debt. US GAAP (ASC 842) keeps a straight-line operating lease expense above EBITDA. Interest-paid classification is a policy choice under current IAS 7 but becomes mandatory financing under IFRS 18 from 1 January 2027. Other IFRS differences: no LIFO, development costs capitalised, impairments reversible except goodwill.

### Cited Findings
**How the statements link**
- Net income not paid out as dividends flows into retained earnings on the BS. Net income is also the starting line of cash from operations (CFO). — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/how-are-the-financial-statements-linked-together/); [CFI](https://corporatefinanceinstitute.com/resources/accounting/3-financial-statements); [F&E Training](https://www.fe.training/free-resources/financial-modeling/linking-three-financial-statements)
- Net income is adjusted for non-cash expenses (chiefly D&A) and for changes in working capital. Depreciation comes off PP&E on the BS, is expensed on the income statement (IS), and is added back in CFO. Capex adds to PP&E and appears in cash from investing (CFI). Debt drives interest expense on the IS and issuance or repayment in cash from financing (CFF). The sum of CFO, CFI and CFF is the net change in cash, which feeds the BS cash line. — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/how-are-the-financial-statements-linked-together/); [CFI](https://corporatefinanceinstitute.com/resources/knowledge/accounting/3-financial-statements-linked); [F&E Training](https://www.fe.training/free-resources/financial-modeling/linking-three-financial-statements)
- The IS and CFS differ because of accrual accounting: revenue recognition, matching and accruals. — [CFI](https://corporatefinanceinstitute.com/resources/accounting/3-financial-statements)

**The classic "depreciation goes up by X" question (formula verified across several sources)**
- Rule: net income falls by D × (1 − t), and cash rises by D × t (the tax shield), assuming the depreciation is also tax-deductible. PP&E falls by D, total assets fall by D × (1 − t), and retained earnings fall by the same amount, so the BS balances. At 20%: NI −$8, cash +$2 ([Wall Street Prep](https://wallstreetprep.com/knowledge/accounting-interview-questions)). At 25%: NI −$7.50, cash +$2.50 ([SuperdayAI](https://www.superdayai.com/questions/technical/10-depreciation-impact)). At 40%: NI −$6, cash +$4 (BIWS-style). — [Breaking Into Wall Street](https://breakingintowallstreet.com/kb/accounting/depreciation-on-the-3-financial-statements); [TheFinanceGrind](https://thefinancegrind.beehiiv.com/p/daily-technical-template-c62feba95ceead27)
- Interviewers often expect you to state the tax rate you are assuming before answering. — [search synthesis of WSP/BIWS/Superday materials](https://wallstreetprep.com/knowledge/accounting-interview-questions)

**Working capital**
- Net working capital (NWC) is usually current assets minus current liabilities. For valuation it normally excludes cash, non-operating assets, debt and debt-like items. The narrowest version is receivables + inventory − payables. Cash and debt are excluded because they are financing or non-operating items, not capital tied up in day-to-day operations. — [CBIZ](https://www.cbiz.com/insights/article/understanding-net-working-capital-a-key-formula-used-in-business-valuation); [VectorShift glossary](https://vectorshift.ai/glossary/net-working-capital); [CFI](https://corporatefinanceinstitute.com/resources/knowledge/finance/what-is-net-working-capital)
- The change in NWC links to the CFS and shows whether working capital is generating or using cash. In a deal, the line between "working capital" and "debt-like" items is often negotiated. — [CBIZ](https://www.cbiz.com/insights/article/understanding-net-working-capital-a-key-formula-used-in-business-valuation); [Intervyo (UK)](https://www.intervyo.co.uk/technicals/working-capital)
- In UFCF, an increase in NWC is subtracted and a decrease is added. — [ibinterviewquestions](https://ibinterviewquestions.com/guides/valuation-investment-banking/unlevered-free-cash-flow-calculation-components); [Wall Street Prep](https://wallstreetprep.com/knowledge/unlevered-free-cash-flow)

**Deferred taxes**
- Accelerated tax depreciation lowers taxable income, and so cash tax, in early years and raises it later. That creates a deferred tax liability (DTL), because it is a temporary difference. Only temporary differences create DTAs or DTLs. Permanent differences, such as tax-exempt interest, do not. — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/deferred-tax-liability-dtl/); [CFI](https://corporatefinanceinstitute.com/resources/accounting/deferred-tax-liability-asset); [AcadiFi](https://acadifi.com/community/deferred-tax-liability-depreciation-temporary-difference)
- DTL = (book–tax temporary difference) × tax rate expected on reversal. Example: a $40,000 difference at 25% gives a $10,000 DTL. — [ibinterviewquestions](https://ibinterviewquestions.com/blog/deferred-tax-assets-liabilities-explained); [CFI](https://corporatefinanceinstitute.com/resources/accounting/deferred-tax-liability-asset)
- In M&A, asset write-ups create a DTL. The extra depreciation on the write-up is deductible for book purposes but not for tax, so DTL = write-up × tax rate. Example: a $10m PP&E write-up at 20% gives a $2m DTL. — [Wall Street Prep (PPA)](https://wallstreetprep.com/knowledge/purchase-price-allocation-ppa); [BIWS (PPA)](https://breakingintowallstreet.com/kb/ma-and-merger-models/purchase-price-allocation/)

**IFRS 16 leases (important for UK and European candidates)**
- IFRS 16 applies to periods beginning on or after 1 January 2019. Lessees recognise a right-of-use (ROU) asset and a lease liability on balance sheet. — [IASB update via Conventus Law](https://conventuslaw.com/report/iasb-updates/); [House of Control](https://www.houseofcontrol.com/blog/ifrs-16-exemptions-short-term-and-low-value)
- There are two optional exemptions. Short-term leases are those of 12 months or less with no purchase option the lessee is reasonably certain to exercise. Low-value assets are guided at roughly $5,000 when new; this is IASB guidance, not a number in the standard. ASC 842 (US GAAP) has only the short-term exemption and no low-value exemption. — [IRIS](https://www.iris.co.uk/?p=128194); [House of Control](https://www.houseofcontrol.com/blog/ifrs-16-exemptions-short-term-and-low-value); [GAAP Dynamics](https://www.gaapdynamics.com/insights/blog/2019/10/01/ifrs-16-vs-asc-842-how-to-account-for-low-value-leases/)
- Under IFRS 16, every lessee lease is treated like a finance lease. The cost splits into ROU depreciation and lease interest, both below EBITDA, so reported EBITDA is higher. Under ASC 842, operating leases keep a single straight-line lease expense within operating costs, above EBITDA. ASC 842 finance leases already follow the IFRS 16 pattern. — [asset.accountant](https://www.asset.accountant/blog/asc-842-vs-ifrs-16/); [MRI Software](https://www.mrisoftware.com/blog/asc-842-vs-ifrs-16-2026-compliance-checklist-for-lease-accounting/); [ibinterviewquestions (leases)](https://ibinterviewquestions.com/guides/valuation-investment-banking/operating-leases-valuation-debt-like-obligations). (One CFA Q&A site, AcadiFi, contradicts this by saying EBITDA is higher under both; the other sources disagree with it.)
- Valuation effect: EBITDA rose artificially when lease expense was reclassified, and EV rises when lease liabilities count as debt. Pre- and post-IFRS 16 multiples are therefore not comparable without adjustment. FTI recommends treating lease liabilities as net debt when EBITDA excludes lease costs. Otherwise use EBITDAaL (EBITDA after leases) for lease-heavy sectors. Pre-2019 precedent transactions need lease adjustments. The effect is large for airlines, logistics, telecom towers and healthcare, and small for tech and financials. — [FTI Consulting](https://www.fticonsulting.com/uk/insights/articles/valuation-implications-ifrs-16)

**Interest and dividend classification in the cash flow statement**
- US GAAP (ASC 230): interest paid and received are operating, taxes paid are operating, and dividends received are operating. Interest paid must be disclosed separately under the indirect method. — [Deloitte DART, Appendix E](https://dart.deloitte.com/USDART/home/codification/presentation/asc230-10/roadmap-statement-cash-flow/appendix-e-differences-between-us-gaap/appendix-e-differences-between-us-gaap); [KPMG](https://kpmg.com/us/en/articles/2022/ifrs-accounting-standards-us-gaap.html)
- Current IAS 7 lets non-financial entities classify interest paid and dividends paid as operating or financing, and dividends received as operating or investing. The IASB noted that practice varies even within one industry. — [Deloitte DART](https://dart.deloitte.com/USDART/home/codification/presentation/asc230-10/roadmap-statement-cash-flow/appendix-e-differences-between-us-gaap/appendix-e-differences-between-us-gaap); [KPMG](https://kpmg.com/us/en/articles/2022/ifrs-accounting-standards-us-gaap.html)
- **IFRS 18 change, effective for annual periods beginning on or after 1 January 2027 (early application permitted).** The options are removed. For entities without "specified main business activities" (most corporates), interest paid is financing, interest received is investing, dividends received is investing and dividends paid is financing. Banks and investors apply different rules. The indirect method now starts from IFRS 18's new "operating profit or loss" subtotal. — [KPMG (2026)](https://kpmg.com/us/en/articles/2026/ifrs-18-changes-statement-cash-flows.html); [IAS Plus, IAS 7](https://www.iasplus.com/standard/ias07.htm); [Grant Thornton](https://www.grantthornton.global/contentassets/25f6122484534d2bb259844e6d814ae5/insights-into-ias-7---ias-7-at-a-glance-final.pdf); [BDO IFRB 2026/05](https://www.bdo.global/getmedia/d27359ee-5875-45ff-9d36-18b8aa59c8fd/IFRB_2026_05.pdf?ext=.pdf)

**Other IFRS vs US GAAP differences that come up**
- LIFO: allowed under US GAAP, prohibited under IFRS (IAS 2). — [ibinterviewquestions (GAAP vs IFRS)](https://ibinterviewquestions.com/blog/gaap-vs-ifrs-investment-banking); [FitSmallBusiness](https://fitsmallbusiness.com/gaap-vs-ifrs/)
- Development costs: expensed under US GAAP (except some internal-use software). Under IFRS (IAS 38) they are capitalised once six criteria are met. — [Achievable CMA notes](https://app.achievable.me/study/cma-part-1/learn/external-financial-reporting-decisions-financial-transactions-us-gaap-versus-ifrs-learning-outcomes); [FitSmallBusiness](https://fitsmallbusiness.com/gaap-vs-ifrs/)
- Impairment reversals: prohibited under US GAAP for long-lived assets. IFRS (IAS 36) permits them, capped at the original carrying amount, except for goodwill. IFRS also allows a revaluation model for PP&E (IAS 16). — [ibinterviewquestions](https://ibinterviewquestions.com/blog/gaap-vs-ifrs-investment-banking); [FitSmallBusiness](https://fitsmallbusiness.com/gaap-vs-ifrs/)
- Goodwill is not amortised under IFRS. IAS 36 requires an annual impairment test at cash-generating-unit (CGU) level, at the same time each year. Recoverable amount is the higher of fair value less costs of disposal and value in use. Both IFRS and US GAAP forbid reversing a goodwill impairment. — [KPMG](https://kpmg.com/us/en/articles/2022/goodwill-impairment-ifrs-standards-us-gaap.html); [Eqvista (IAS 36)](https://eqvista.com/documents/goodwill-impairment-ias-36/); [ICAEW](https://icaew.com/technical/corporate%20reporting/ifrs/ifrs%20standards/ias%2036%20impairment%20of%20assets)

**UK tax rate for £ examples**
- UK corporation tax main rate is 25% from 1 April 2023 (profits over £250,000). The small profits rate is 19% (profits up to £50,000), with marginal relief in between. The rate was a flat 19% from April 2017 to March 2023. — [Charlton Baker (citing HMRC)](https://charltonbaker.co.uk/news-blog/corporation-tax-changes-from-april-2023); [GoFile CT rates](https://gofile.co.uk/knowledgebase/corporation-tax/corporation-tax-rates/)

### Inferences
#### Worked example 1: depreciation +£10 at a 25% UK tax rate (derived, using the cited rule)
| Statement | Line | Change | Why |
|---|---|---|---|
| IS | Depreciation | +£10.00 | Given |
| IS | EBIT / PBT | −£10.00 | Expense up |
| IS | Tax | −£2.50 | 25% × £10 |
| IS | **Net income** | **−£7.50** | £10 × (1 − 25%) |
| CFS | Net income | −£7.50 | Starting line |
| CFS | Add back D&A | +£10.00 | Non-cash |
| CFS | **Net change in cash** | **+£2.50** | Tax shield = £10 × 25% |
| BS | Cash | +£2.50 | From CFS |
| BS | PP&E | −£10.00 | Accumulated depreciation |
| BS | **Total assets** | **−£7.50** | |
| BS | Retained earnings | −£7.50 | From NI |
| BS | **Total L + E** | **−£7.50** | Balances |

- **Advanced variant (deferred tax):** suppose only *book* depreciation rises and *tax* depreciation is unchanged, for example because a useful-life estimate changed. Book tax expense still falls by £2.50, but cash tax does not change. The £2.50 shows up as a non-cash deferred-tax movement in CFO (DTL down, or DTA up), so cash is unchanged. That is a strong follow-up answer. It is derived from the temporary-difference logic in WSP and CFI above.
- **UK nuance:** in the UK, accounting depreciation is not itself tax-deductible; capital allowances apply instead. The textbook interview answer assumes depreciation is deductible, so state "assuming book = tax depreciation". This is my inference from general UK tax knowledge and was not verified in this research (see Gaps).

#### Worked example 2: other standard walk-throughs (derived; tax 25%)
- **Buy £100 of inventory with cash:** no IS effect. CFS: increase in inventory −£100 in CFO. BS: cash −£100, inventory +£100.
- **Sell that inventory for £150 on credit (COGS £100):** IS: revenue +150, COGS −100, PBT +50, tax −12.5, NI +37.5.
  - *If the tax is accrued (unpaid):* CFS is NI +37.5, decrease in inventory +100, increase in receivables −150, increase in tax payable +12.5, so CFO is 0 and cash is unchanged. BS assets: receivables +150, inventory −100, a net +50. L + E: tax payable +12.5, retained earnings +37.5, a net +50.
  - *If the tax is paid in cash:* there is no tax-payable line, so CFO is −12.5 and cash falls by 12.5.
  - Interviewers vary on this, so state your assumption.
- **Goodwill impairment of £50 (IFRS, typically not tax-deductible):** IS: impairment −£50, NI −£50 (no tax shield). CFS: add back +£50, so cash unchanged. BS: goodwill −£50, retained earnings −£50. If the interviewer says assume it is deductible: NI −£37.50, cash +£12.50.
- **Raise £100 debt at 6% and hold one year:** at issue, CFF +100, BS cash +100, debt +100. In year 1, interest £6 gives NI −£4.50. Under US GAAP, or IFRS with operating classification, CFO is −£4.50. **Under IFRS 18 from 2027**, CFO is built from operating profit, which interest does not affect. Lower tax paid adds +£1.50 in CFO, interest paid of −£6 sits in CFF, and the net cash change is still −£4.50. BS: cash −£4.50, retained earnings −£4.50.

#### Teaching notes
- IFRS 18 takes effect on 1 January 2027, which falls inside the next recruitment cycle. A UK candidate who says "under IFRS 18 interest paid goes to financing, unlike US GAAP where it is operating" will stand out. Most US-centric guides (BIWS, WSP, Vault) are built on US GAAP.
- Because of IFRS 16, a UK or European comps sheet must be internally consistent. Either include lease liabilities in EV and use post-IFRS 16 EBITDA, or exclude them and use EBITDAaL. This is a natural "why are you different from a US candidate" talking point.

### Gaps
- Could not fetch ifrs.org directly, so the IFRS 16 effective date and exemptions come from secondary sources. The UK Endorsement Board's adoption status and date for IFRS 18 in UK-adopted IFRS was not verified.
- UK capital allowances (rather than accounting depreciation) as the tax-deductible item was not verified with a source.
- UK GAAP (FRS 102) treatment of goodwill amortisation for private UK companies, often relevant for UK mid-market targets, was not researched or sourced.
- No primary source was found for a standard numerical goodwill-impairment walk-through. The example above is derived.

---

## 2. Enterprise value vs equity value: the bridge and the trick questions

### Takeaway
Equity value is the value to common shareholders: diluted shares × share price. Enterprise value (EV) is the value of the core operations to all capital providers. EV = equity value + debt (including IFRS 16 lease liabilities if EBITDA is pre-lease) + preferred + non-controlling interests (NCI) + debt-like items such as pension deficits − cash − non-operating assets such as associates. Every adjustment exists to keep the numerator consistent with what the operating metric (EBITDA) captures.

### Cited Findings
- **Why subtract NCI (going EV → equity) / add NCI (equity → EV):** consolidated EBITDA includes 100% of a controlled subsidiary even when the parent owns, say, 80%, so the 20% outside claim must be added to EV. Preferred stock and NCI rank ahead of common equity. — [Hebbia](https://hebbia.com/resources/enterprise-value-to-equity-value-bridge); [VectorShift](https://vectorshift.ai/glossary/bridge-to-equity-value); [Wall Street Prep](https://wallstreetprep.com/knowledge/equity-value-to-enterprise-value-bridge)
- **Why subtract associates / equity investments in EV:** equity-method stakes, typically 20–50%, are not consolidated, so their earnings are not in EBITDA. They are non-core assets the operating multiple does not capture. — [F&E Training](https://fe.training/?p=10001242); [VectorShift](https://vectorshift.ai/glossary/bridge-to-equity-value)
- Going EV → equity: subtract debt, preferred and NCI, add cash and non-operating investments. Going the other way, the signs flip. Buyer and seller negotiate these definitions in the SPA. — [ibinterviewquestions](https://ibinterviewquestions.com/blog/enterprise-value-vs-equity-value-guide); [VectorShift](https://vectorshift.ai/glossary/bridge-to-equity-value)
- **Pension deficits:** usually treated as debt-like and added to EV. Some banks tax-effect the deficit (× (1 − t)), which is a convention, not a rule. Other debt-like items include environmental remediation, deferred compensation, asset-retirement obligations, finance leases and convertibles. Inclusion is a judgement call. — [ibinterviewquestions (pensions)](https://ibinterviewquestions.com/guides/valuation-investment-banking/pensions-off-balance-sheet-hidden-liabilities); [ibinterviewquestions (net debt)](https://ibinterviewquestions.com/blog/net-debt-explained-what-counts-as-debt)
- **IFRS 16 leases in the bridge:** lease liabilities should be in net debt when EBITDA is post-IFRS 16 (pre-lease cost). Otherwise use EBITDAaL. — [FTI Consulting](https://www.fticonsulting.com/uk/insights/articles/valuation-implications-ifrs-16); [MRI Software](https://www.mrisoftware.com/blog/asc-842-vs-ifrs-16-2026-compliance-checklist-for-lease-accounting/)
- **Diluted shares (treasury stock method, TSM):** assume all in-the-money options and warrants are exercised, and use the proceeds to buy back shares at the current price. The net new shares are added to basic shares. Anti-dilutive instruments are excluded. Every equity value and per-share metric in IB uses diluted shares. — [CFI](https://corporatefinanceinstitute.com/resources/valuation/treasury-stock-method/); [AccountingTools](https://www.accountingtools.com/articles/treasury-stock-method.html); [ibinterviewquestions](https://ibinterviewquestions.com/blog/treasury-stock-method-diluted-shares-explained)
- **Multiple pairing:** EV goes with pre-interest metrics (EBITDA, EBIT, revenue). Equity value or share price goes with post-interest metrics (net income, EPS). EV/net income is a mismatch. Two firms with very different P/Es can have near-identical EV/EBITDA when one carries heavy debt, because its interest expense depresses earnings. — [fffinstill](https://fffinstill.com/learning/comparisons/pe-vs-ev-ebitda); [AcadiFi](https://acadifi.com/community/pe-ratio-vs-ev-ebitda-relative-valuation-cfa-level-2); [CodeSignal](https://codesignal.com/learn/courses/core-valuation-methods/lessons/enterprise-value-vs-equity-value)
- **Unlevered vs levered:** UFCF discounted at WACC gives EV. Levered FCF, which is after interest, discounted at the cost of equity gives equity value directly. Using levered FCF to get EV is a classic error. — [Wall Street Prep (top 10 questions)](https://www.wallstreetprep.com/knowledge/top-10-investment-banking-interview-questions); [Street of Walls](https://www.streetofwalls.com/finance-training-courses/investment-banking-technical-training/discounted-cash-flow/)

### Inferences
#### Worked example 3: EV bridge for a UK plc (derived; £m)
Inputs: share price £5.00; 100m basic shares; 10m options with a £3.00 strike.
- TSM: proceeds = 10m × £3.00 = £30m, which buys back £30m ÷ £5.00 = 6m shares. Net new shares = 4m, so diluted shares = **104m**.
- Equity value = 104m × £5.00 = **£520m**.

| Bridge item | £m | Sign | Rationale |
|---|---|---|---|
| Equity value (diluted) | 520 | | |
| + Borrowings (bank debt + bonds) | 200 | + | Debt claim |
| + IFRS 16 lease liabilities | 80 | + | Because EBITDA is post-IFRS 16 (excludes lease cost) |
| + Preference shares | 20 | + | Senior claim |
| + Non-controlling interests | 30 | + | EBITDA consolidates 100% of subsidiary |
| + Pension deficit (pre-tax; tax-effected would be £18.75m) | 25 | + | Debt-like |
| − Cash and equivalents | (70) | − | Non-operating |
| − Investments in associates | (40) | − | Earnings not in EBITDA |
| **Enterprise value** | **765** | | |

- If post-IFRS 16 EBITDA is £85m, EV/EBITDA = **9.0x**. Consistency check: if the analyst excludes the £80m lease liability (EV £685m), they must divide by EBITDAaL. For example, £85m less an assumed £10m lease cash cost = £75m gives 9.1x. Mixing EV ex-leases with pre-lease EBITDA understates the multiple: £685m ÷ £85m = 8.1x.

#### Trick questions (derived from the bridge identity EV = equity + net debt + other claims)
- *Company raises £100m of debt and holds the cash:* debt +100 and cash +100, so EV is unchanged and equity value is unchanged.
- *Raises £100m of debt to buy back shares:* equity value −100 and debt +100, so EV is unchanged (ignoring signalling and tax shields).
- *Issues £100m of new shares for cash:* equity +100 and cash +100, so EV is unchanged.
- *Pays a £50m dividend:* equity value falls about 50 and cash −50, so EV is unchanged.
- *Uses £100m of cash to buy a factory:* cash −100 and equity value is initially unchanged, so measured EV rises by 100. The value has moved from a non-operating asset (cash) into operations.
- *Can EV be negative?* Yes, when cash exceeds market cap + debt + other claims. This is rare and seen in cash-rich, distressed or mispriced companies. Treat it as a flag to check the inputs. *Can equity value be negative?* Market equity value cannot, since a share price is ≥ 0. Book equity can, after accumulated losses, large buybacks or leveraged recaps.
- *Why subtract cash?* EV values the operations. Cash is non-operating, and an acquirer effectively gets it back, for example by using it to repay debt.

### Gaps
- No primary or UK-specific guidance was found on whether UK banks typically tax-effect pension deficits. Practice varies by bank.
- Could not fetch the full WSP or BIWS bridge pages to quote their exact itemisation (for example, treatment of convertibles above or below the strike, or of operating vs finance leases in US comps).

---

## 3. Valuation methods: comps, precedents, DCF (UFCF, WACC, CAPM, beta, terminal value, mid-year), LBO, SOTP; which gives the highest value; the football field

### Takeaway
Rosenbaum & Pearl frame the four core methods: trading comps, precedent transactions, DCF and LBO. These are presented together on a "football field". Precedents usually give the highest values because they embed a 20–40% control premium and often synergies. Trading comps usually give the lowest. The DCF depends heavily on assumptions; terminal value is typically 60–80% of EV. The LBO gives a floor-type "what a financial sponsor could pay" value. SOTP is used for multi-segment groups and spin-off analysis.

### Cited Findings
**The four core methods**
- Rosenbaum & Pearl's *Investment Banking* centres on comparable companies, precedent transactions, DCF and LBO analysis, plus M&A, and since the 3rd edition IPOs. It includes six downloadable model templates: comps, precedents, DCF, LBO, M&A and IPO. — [Wiley press release (2020)](https://investors.wiley.com/news/news-details/2020/Wiley-to-Publish-Final-Installment-of-Renowned-Little-Book-Series-by-Joshua-Pearl-and-Joshua-Rosenbaum-and-the-Updated-Edition-of-the-Global-Best-Seller-Investment-Banking-to-Help-Investors-and-Companies-Navigate-Todays-Dynamic-Market-2020-3-19/default.aspx); [O'Reilly listing](https://oreilly.com/library/view/investment-banking-3rd/9781119867876)

**Which gives the highest value, and the football field**
- Precedent transactions usually come out highest because transaction multiples embed a control premium, typically 20–40% over the pre-deal price, which trading comps lack. Comps usually come out lowest, since they reflect minority-stake pricing. A DCF can be highest if growth and WACC assumptions are aggressive, but typically sits between comps and precedents. — [ibinterviewquestions (highest/lowest)](https://ibinterviewquestions.com/guides/valuation-investment-banking/which-valuation-method-highest-lowest-value); [ibinterviewquestions (control premiums)](https://ibinterviewquestions.com/guides/valuation-investment-banking/control-premiums-why-transaction-multiples-exceed-trading); [CFI (precedents)](https://corporatefinanceinstitute.com/learn/resources/valuation/precedent-transaction-analysis/)
- The football field chart synthesises ranges from each method. The overlap zone is where methods agree. If precedents sit far above everything else, likely causes are a frothier market at the time of those deals, or synergy-driven premiums. — [Ryan O'Connell Finance](https://ryanoconnellfinance.com/football-field-valuation/); [ibinterviewquestions (football field)](https://ibinterviewquestions.com/blog/football-field-valuation-chart-guide)

**DCF: unlevered free cash flow (verified across three sources)**
- **UFCF = EBIT × (1 − t) + D&A − Capex − ΔNWC** (NOPAT + D&A − capex − ΔNWC). Tax is computed on EBIT as if the firm had no debt, so the interest tax shield is excluded. Worked example: EBIT $10m, 25% tax, D&A $1.5m, capex $2m, ΔNWC +$0.5m gives UFCF = $6.5m. Discounting UFCF at WACC gives EV; then bridge to equity. — [Wall Street Prep](https://wallstreetprep.com/knowledge/unlevered-free-cash-flow); [ibinterviewquestions](https://ibinterviewquestions.com/guides/valuation-investment-banking/unlevered-free-cash-flow-calculation-components); [open-exam-prep (FMVA)](https://open-exam-prep.com/study-guides/fmva/valuation-foundations/unlevered-free-cash-flow)

**WACC and CAPM (verified across three sources)**
- **WACC = (E/V) × Re + (D/V) × Rd × (1 − t)**, using market values. **CAPM: Re = Rf + β × (Rm − Rf)**. The ERP is cited as about 4–7% historically; sources disagree on the exact range. After-tax cost of debt example: 6% × (1 − 25%) = 4.5%. Cost of debt is the yield to maturity. Book-value equity weights understate equity and distort WACC. — [CFI](https://corporatefinanceinstitute.com/learn/resources/valuation/what-is-wacc-formula); [ibinterviewquestions (WACC)](https://ibinterviewquestions.com/blog/how-to-calculate-wacc-guide); [LearnSignal (CAPM)](https://www.learnsignal.com/blog/cost-of-equity-capm-explained-guide/)
- Risk-free rate: the government bond yield, quoted as the 10-year US Treasury in US-centric sources. A £ DCF would use gilts; see Inferences. — [ibinterviewquestions (WACC)](https://ibinterviewquestions.com/blog/how-to-calculate-wacc-guide)

**Beta levering and unlevering (Damodaran, NYU Stern; consistent across several of his course decks)**
- **Levered (equity) beta = Unlevered beta × [1 + (1 − t) × (D/E)]**. Unlevered beta of a business = average comparable-firm regression beta ÷ [1 + (1 − t) × average D/E].
- Bottom-up procedure: identify the businesses, collect peer regression betas, average them, unlever at the peer average D/E, then relever at the target's D/E.
- Bottom-up betas have lower standard error than a single regression beta and work for private firms, IPOs and divisions. Some versions also subtract a debt-beta term or drop the (1 − t).
- — [Damodaran, Valuation Spring 2020 Session 6](https://pages.stern.nyu.edu/~adamodar/podcasts/valspr20/session6slides.pdf); [Damodaran, Valuation Spring 2022 Session 6](https://pages.stern.nyu.edu/~adamodar/podcasts/valspr22/session6slides.pdf); [Damodaran, Corporate Finance Spring 2019 Session 9](https://pages.stern.nyu.edu/~adamodar/podcasts/cfspr19/session9slides.pdf)

**Terminal value (verified across four sources)**
- **Gordon growth TV = FCF_N × (1 + g) ÷ (WACC − g)**, with g < WACC. **Exit multiple TV = EBITDA_N × exit multiple**, with the multiple drawn from comps or precedents. Practitioners compute both and cross-check. An implied perpetual growth rate that is too high, or above WACC, signals inconsistent assumptions. TV is commonly 60–80% of DCF EV. — [open-exam-prep (TV & bridge)](https://open-exam-prep.com/study-guides/fmva/dcf-valuation/terminal-value-and-equity-bridge); [ibinterviewquestions (TV)](https://ibinterviewquestions.com/blog/terminal-value-gordon-growth-vs-exit-multiple); [Valutico](https://help.valutico.com/en/articles/16305356-terminal-value-gordon-growth-model-vs-exit-multiple); [BVResources](https://www.bvresources.com/articles/bvwire/avoid-this-inconsistency-with-the-terminal-value)

**Mid-year convention (verified across three or more sources)**
- Discount factor = 1 ÷ (1 + r)^(t − 0.5). Equivalently, mid-year PV = year-end PV × (1 + WACC)^0.5. This reflects cash arriving through the year, so it raises value. Estimates of the uplift vary: about 3–5% typical, 5–10% in some cases, and larger at high discount rates. — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/mid-year-convention/); [BIWS](https://breakingintowallstreet.com/kb/discounted-cash-flow-analysis-dcf/mid-year-convention-dcf); [ibinterviewquestions (discounting)](https://ibinterviewquestions.com/guides/valuation-investment-banking/discounting-mechanics-present-value-mid-year-convention); [ValuAdder](https://www.valuadder.com/blog/discounted-cash-flow-business-valuation-using-the-mid-year-convention/)
- **Conflict on TV discounting under mid-year:** one view discounts a Gordon TV by N − 0.5 periods to stay consistent with mid-year flows ([BVResources](https://www.bvresources.com/articles/bvwire/avoid-this-inconsistency-with-the-terminal-value)). For the exit-multiple TV, one source says use the same convention as the explicit flows ([open-exam-prep](https://open-exam-prep.com/study-guides/fmva/dcf-valuation/terminal-value-and-equity-bridge)). F&E/Felix argues the exit multiple represents a sale at the end of year N, so discount it a full N periods ([Felix, F&E Training](https://felix.fe.training/video-lesson/lesson/dcf-valuation/?video=1142)). The full-N view is the more common practitioner convention for exit multiples.
- A negative near-term FCF does not invalidate a DCF. Project until the business reaches a normalised steady state before computing TV. — [Wall Street Prep (top 10 questions)](https://www.wallstreetprep.com/knowledge/top-10-investment-banking-interview-questions)

**Sum-of-the-parts (SOTP)**
- SOTP suits companies with unrelated segments and is used to estimate value unlocked by spin-offs, split-offs or carve-outs. Each segment is valued with its own peers and multiples, for example EV/Revenue for unprofitable high-growth tech, or book value / earnings for banks and insurers. A conglomerate discount may then be applied; cited at 10–15% typically, though its existence is contested in CFA materials. — [AnalystPrep (CFA L2)](https://analystprep.com/study-notes/cfa-level-2/sum-of-parts-valuation/); [BDO Securities](https://www.bdo.com.ph/bdo-securities/education/sum-of-the-parts-valuation); [ibinterviewquestions (SOTP)](https://ibinterviewquestions.com/blog/sum-of-the-parts-sotp-valuation-guide)

### Inferences
#### Worked example 4: simple 5-year DCF in £ (derived; all figures £m, checked in Python)
**Assumptions:** Year-0 revenue £1,000m, growing 5% a year. EBIT margin 15%. Tax 25% (UK main rate). D&A 4% of revenue, capex 5% of revenue, NWC investment 10% of the revenue increase. Net debt £300m. 100m diluted shares.

**WACC build:**
- Unlevered beta (peer average) 0.90; target D/E 25% (so D/V 20%, E/V 80%).
- Relevered β = 0.90 × [1 + (1 − 0.25) × 0.25] = 0.90 × 1.1875 = **1.069**.
- Rf 4.5% (an illustrative 10-year gilt yield; check the current figure) and ERP 5.25% give Re = 4.5% + 1.069 × 5.25% = **10.11%**.
- Pre-tax Rd 6.0% gives after-tax Rd = 6.0% × 0.75 = **4.50%**.
- WACC = 0.80 × 10.11% + 0.20 × 4.50% = **8.99% ≈ 9.0%**.

| £m | Y1 | Y2 | Y3 | Y4 | Y5 |
|---|---|---|---|---|---|
| Revenue | 1,050.0 | 1,102.5 | 1,157.6 | 1,215.5 | 1,276.3 |
| EBIT (15%) | 157.5 | 165.4 | 173.6 | 182.3 | 191.4 |
| NOPAT (× 0.75) | 118.1 | 124.0 | 130.2 | 136.7 | 143.6 |
| + D&A (4%) | 42.0 | 44.1 | 46.3 | 48.6 | 51.1 |
| − Capex (5%) | (52.5) | (55.1) | (57.9) | (60.8) | (63.8) |
| − ΔNWC | (5.0) | (5.3) | (5.5) | (5.8) | (6.1) |
| **UFCF** | **102.6** | **107.8** | **113.1** | **118.8** | **124.7** |
| Discount factor at 9% (year-end) | 0.9174 | 0.8417 | 0.7722 | 0.7084 | 0.6499 |
| PV of UFCF | 94.1 | 90.7 | 87.4 | 84.2 | 81.1 |

- Sum of PV of explicit UFCF = **£437.5m**.
- **Gordon TV** (g = 2%) = 124.74 × 1.02 ÷ (0.09 − 0.02) = **£1,817.7m**. PV = 1,817.7 × 0.6499 = **£1,181.4m**.
- **EV = £1,618.8m**. TV is 73% of EV, inside the cited 60–80% band.
- Cross-check: Y5 EBITDA = (15% + 4%) × 1,276.3 = £242.5m. The implied exit multiple is 1,817.7 ÷ 242.5 = **7.5x**.
- Exit-multiple version at 8.0x: TV = £1,940.0m, PV = £1,260.8m, EV = **£1,698.3m**. Implied perpetual growth = (TV × WACC − FCF_N) ÷ (TV + FCF_N) = **2.4%**, which is plausible against long-run UK nominal GDP.
- Mid-year convention: PV of explicit flows rises to £456.7m (× 1.09^0.5 = 1.044). With TV discounted at N, EV = **£1,638.1m**. Discounting the Gordon TV at N − 0.5 instead gives EV = £1,690.1m.
- Equity value = £1,618.8m − £300m net debt = **£1,318.8m**, or **£13.19 per share** (year-end, Gordon case). In practice, also subtract leases, NCI and pension deficits as in Section 2.
- Sensitivity tables, WACC ± 0.5–1.0% against g ± 0.5% or exit multiple ± 1.0x, are standard. Here a 1-point change in (WACC − g) moves the Gordon TV by roughly 12–17%: 7% → 8% gives −12.5%, and 7% → 6% gives +16.7%. That shows why TV dominates.

#### Teaching notes
- £ DCFs need £ inputs: the gilt yield for Rf, a UK or European ERP (Damodaran publishes country ERPs), and the 25% UK tax rate. Under IFRS 16 there is a choice. Treat leases as debt (keep lease liabilities in net debt and leave lease cash costs out of UFCF), or treat lease payments as operating costs (deduct them in UFCF and exclude lease liabilities). Doing both double-counts. This is my inference from the FTI consistency principle.
- Order of difficulty for teaching: comps → precedents → UFCF → WACC/CAPM → beta relevering → TV methods → mid-year → sensitivities → SOTP → LBO as a valuation method.

### Gaps
- Could not fetch Damodaran's current ERP and country-risk datasets or the current 10-year gilt yield. The 4.5% Rf and 5.25% ERP above are illustrative only.
- No authoritative source settled how to discount an exit-multiple TV under the mid-year convention. Sources conflict.
- R&P's full chapter list for the 3rd edition was not retrieved. Whether a newer (4th) edition existed by October 2026 was not checked.

---

## 4. Multiples: EV vs equity multiples and sector-specific multiples (banks, REITs, insurers)

### Takeaway
Pair EV with metrics available to all capital providers (Revenue, EBITDA, EBIT; EBITDAaL in IFRS 16 lease-heavy sectors). Pair equity value or share price with metrics after interest and attributable to equity (net income or EPS → P/E; book value → P/BV). Financial institutions are valued on equity multiples because debt and interest are operating items for them:
- Banks: P/TBV, linked to ROTE against cost of equity, plus P/E and DDM.
- Insurers: P/BV or P/EV (embedded value) for life insurers.
- REITs: P/FFO, P/AFFO and P/NAV.

### Cited Findings
- **Pairing rule:** EV/EBITDA (numerator is whole-firm value, denominator is pre-interest) versus P/E (equity value over earnings after interest). EV/EBITDA ignores capex and so flatters capital-intensive firms. P/E is meaningless with negative earnings, when EBITDA may still be positive. — [fffinstill](https://fffinstill.com/learning/comparisons/pe-vs-ev-ebitda); [AcadiFi](https://acadifi.com/community/ev-ebitda-vs-pe-when-to-use-equity-valuation-cfa-level-1)
- **Banks: justified P/TBV ≈ (ROE − g) ÷ (COE − g)**, derived from Gordon growth applied to equity. Example: ROE 15%, COE 10%, g 3% gives about 1.7x TBV. A bank earning ROE > COE trades above 1.0x book, ROE = COE about 1.0x, and ROE < COE below 1.0x. Use forward ROE, and ROTCE with P/TBV. Sustainable g = ROE × retention ratio. DDM is often cross-checked with P/E. — [ibinterviewquestions (FIG valuation)](https://ibinterviewquestions.com/guides/valuation-investment-banking/financial-institutions-valuation-ptbv-ddm-embedded-value); [Ryan O'Connell (P/B)](https://ryanoconnellfinance.com/price-to-book-ratio/); [BIWS (P/BV derivation)](https://breakingintowallstreet.com/kb/bank-modeling/price-to-book-value/); [ibinterviewquestions (justified P/BV)](https://ibinterviewquestions.com/guides/fig-investment-banking/justified-pbv-ratio-linking-roe-to-valuation)
- **REITs:** FFO = net income + real-estate D&A − gains on property sales. Its definition is standardised by NAREIT. AFFO = FFO − recurring capex − straight-line rent adjustments, and is not standardised. P/FFO = price ÷ FFO per share and is the REIT analogue of P/E. NAV = market value of properties (typically NOI ÷ cap rate) − debt − preferred, divided by shares. NAV is analyst-estimated, not reported. Worked example: NI $45m + D&A $30m − $5m gain = FFO $70m, or $3.50 per share on 20m shares; at 18x, that is $63. — [AnalystPrep (CFA L2)](https://analystprep.com/study-notes/cfa-level-2/reit-share-value-calculation-using-net-asset-value-p-ffo-p-affo-and-discounted-cash-flow-approaches/); [F&E REIT summary PDF](https://media.felix.fe.training/2019/11/REIT-Valuation-Summary-enpyumlj.pdf); [Nasdaq](https://www.nasdaq.com/articles/how-value-real-estate-investment-trust-reit)
- **Insurers:** embedded value (EV) = adjusted net asset value + value of in-force business. It is the dominant life-insurance valuation measure, while banks use P/TBV and ROE. Milliman's European study found average market cap moved from about 90% of embedded value (end-2012) to about 110% (end-2013). Solvency II (from 1 January 2016) led some insurers to scale back or change EV reporting, and the EEV/MCEV principles were amended in May 2016. — [ibinterviewquestions (embedded value)](https://ibinterviewquestions.com/guides/fig-investment-banking/embedded-value-life-insurance); [Actuarial Post (Milliman)](https://actuarialpost.co.uk/article/milliman-reviews-embedded-value-of-major-european-insurers-6491.htm); [Milliman 2016 mid-year EV](https://ie.milliman.com/-/media/milliman/importedfiles/uploadedfiles/insight/2016/2016-mid-year-ev-eu.ashx)
- **Lease-heavy sectors under IFRS 16:** EBITDAaL multiples are used. — [FTI Consulting](https://www.fticonsulting.com/uk/insights/articles/valuation-implications-ifrs-16)

### Inferences
- Bank example check: (15% − 3%) ÷ (10% − 3%) = 12 ÷ 7 = **1.71x**, matching the cited ~1.7x. A £ version: a UK bank with 12% ROTE, 11% COE and 2% g gives (12 − 2) ÷ (11 − 2) = **1.11x TBV**.
- Teaching table:

| Multiple | Numerator | Denominator | Typical use |
|---|---|---|---|
| EV/Revenue | EV | Revenue | Early-stage, unprofitable, high-growth |
| EV/EBITDA | EV | EBITDA | Default for most corporates |
| EV/EBITDAaL | EV ex-leases | EBITDA after lease costs | IFRS 16 lease-heavy (retail, airlines, telcos) |
| EV/EBIT | EV | EBIT | Capital-intensive (captures D&A) |
| P/E | Equity value | Net income | Mature, profitable; also FIG |
| P/BV, P/TBV | Equity value | (Tangible) book equity | Banks, insurers |
| P/FFO, P/AFFO, P/NAV | Equity value | FFO / AFFO / NAV | REITs and property companies |
| P/EV (embedded value) | Equity value | Embedded value | Life insurers |

### Gaps
- No sourced material was found for other sector metrics: EV/EBITDAX or EV/reserves (oil & gas), EV/subscriber (telecom), combined ratio and P/BV for general (P&C) insurers, or current European insurer P/EV levels. The most recent Milliman data found was from 2016.
- UK property companies are often valued on discount or premium to EPRA NTA (European Public Real Estate Association net tangible assets) rather than US NAREIT FFO. Not verified with a source in this research.

---

## 5. M&A: accretion/dilution, sources & uses, purchase price allocation and goodwill, synergies, cash vs stock, and why buyers pay a premium

### Takeaway
A merger model asks whether pro forma EPS rises (accretion) or falls (dilution). The quick test compares the target's earnings yield at the offer price with the acquirer's cost of each funding source:
- Stock: the acquirer's earnings yield, i.e. 1 ÷ its P/E.
- New debt: interest rate × (1 − t).
- Cash: forgone interest × (1 − t).

Goodwill is the purchase price minus the fair value of identifiable net assets, after write-ups and the DTL they create. The premium is justified only if the PV of net synergies exceeds it.

### Cited Findings
- **All-stock rule:** if acquirer P/E > target P/E *at the offer price*, the deal is accretive; if lower, dilutive. This assumes no synergies or fees. Use the offer price, not the unaffected price. — [BIWS (EPS accretion/dilution)](https://breakingintowallstreet.com/kb/ma-and-merger-models/eps-accretion-dilution/); [Intervyo (UK)](https://www.intervyo.co.uk/technicals/accretion-dilution); [ibinterviewquestions (P/E arbitrage)](https://ibinterviewquestions.com/guides/valuation-investment-banking/pe-arbitrage-rule-of-thumb-quick-accretion-dilution)
- **Cash/debt rule:** accretive if the target's earnings yield (1 ÷ offer P/E) exceeds the after-tax cost of debt, i.e. interest × (1 − tax). Example: 5% debt at 25% tax costs 3.75% after tax. Mixed deals weight the cost of each component. A cash-and-stock mix can turn a dilutive all-stock deal accretive. — [BIWS](https://breakingintowallstreet.com/kb/ma-and-merger-models/eps-accretion-dilution/); [Ryan O'Connell (accretion/dilution)](https://ryanoconnellfinance.com/accretion-dilution-analysis/); [Intervyo](https://www.intervyo.co.uk/technicals/accretion-dilution)
- **Limits:** precise answers require the full model, covering fees, synergies, write-ups (extra amortisation from intangible write-ups), timing, and forgone interest on cash. — [BIWS](https://breakingintowallstreet.com/kb/ma-and-merger-models/eps-accretion-dilution/); [ibinterviewquestions (accretion/dilution)](https://ibinterviewquestions.com/guides/valuation-investment-banking/accretion-dilution-analysis-measuring-eps-impact)
- **Goodwill / PPA:** goodwill = purchase price − fair value of net identifiable assets, including any deal-created DTL. A fuller BIWS version: equity purchase price − seller's book equity + seller's existing goodwill − asset write-ups + DTL created (and other liability write-ups). Existing seller goodwill is written off, and seller deferred-tax balances generally reverse. Write-up percentages are often benchmarked to recent comparable deals. — [Wall Street Prep (PPA)](https://wallstreetprep.com/knowledge/purchase-price-allocation-ppa); [BIWS (PPA)](https://breakingintowallstreet.com/kb/ma-and-merger-models/purchase-price-allocation/); [ibinterviewquestions (pro forma BS)](https://ibinterviewquestions.com/guides/valuation-investment-banking/pro-forma-balance-sheet-purchase-price-allocation)
- **Premium and synergies:** the acquisition premium is the amount paid above the target's pre-bid price. The deal is positive-NPV only if the PV of synergies, net of integration and transaction costs, exceeds the premium. The "winner's curse" says the winning bidder is often the one that most overestimates value. — [AnalystPrep (CFA L2, price & payment method)](https://analystprep.com/study-notes/cfa-level-2/effects-of-price-and-payment-method/); [ibinterviewquestions (premiums)](https://ibinterviewquestions.com/prep/guides/valuation/premiums-synergies-and-consideration)
- **Cash vs stock:**
  - A buyer confident in its synergies pays cash. Stock shares synergy risk with target holders, and issuing stock can signal the buyer thinks its shares are fully valued.
  - Cash gives target holders an immediate taxable gain, while stock can defer tax (jurisdiction-dependent).
  - Cash or debt is more accretive when the after-tax cost of debt is below the acquirer's earnings yield.
  - — [AnalystPrep](https://analystprep.com/study-notes/cfa-level-2/effects-of-price-and-payment-method/); [Ryan O'Connell (M&A)](https://ryanoconnellfinance.com/mergers-acquisitions-valuation/); [ibinterviewquestions (consideration)](https://ibinterviewquestions.com/prep/guides/valuation/premiums-synergies-and-consideration)
- **Sources & uses:**
  - Uses typically cover the equity purchase price, refinancing of target debt, transaction (advisory) fees and debt financing fees.
  - Sources typically cover debt tranches, sponsor or acquirer equity and rollover equity, with equity as the plug.
  - Example: uses of $800m equity price + $150m refinanced debt + $50m fees = $1,000m. Sources of $400m TLB + $200m senior unsecured notes + $50m mezzanine + $300m sponsor equity + $50m management rollover = $1,000m, so leverage is 6.5x on $100m EBITDA.
  - Omitting fees understates the equity cheque and overstates returns.
  - — [A Simple Model (S&U)](https://www.asimplemodel.com/insights/sources-and-uses); [ibinterviewquestions (S&U)](https://ibinterviewquestions.com/guides/valuation-investment-banking/sources-and-uses-of-funds-lbo); [Uplevered](https://uplevered.com/definitions/sources-and-uses/); [Overleveraged Buyouts](https://overleveragedbuyouts.substack.com/p/intro-to-lbo-modeling-what-are-sources)

### Inferences
#### Worked example 5: accretion/dilution in £ (derived; checked in Python; tax 25%; no fees, synergies or PPA amortisation unless stated)
- Acquirer: share price £20.00, 100m shares, net income £100m, so EPS £1.00 and P/E 20.0x. Earnings yield = 5.0%, which is the "cost" of stock.
- Target: undisturbed price £10.00, 50m shares, net income £30m (EPS £0.60, P/E 16.7x).
- Offer at a 30% premium: £13.00 per share, so the equity purchase price is **£650m** and the offer P/E is **21.7x**. Target earnings yield at offer = 30 ÷ 650 = **4.62%**.

| Funding | Calculation | PF net income | PF shares | PF EPS | Accretion / (dilution) | Rule-of-thumb check |
|---|---|---|---|---|---|---|
| 100% stock | 650 ÷ 20 = 32.5m new shares | 130.0 | 132.5m | £0.981 | **(1.9%)** | Cost 5.0% > yield 4.62% → dilutive ✓ |
| 100% new debt at 6% | Interest 39.0 × 0.75 = 29.25 after tax | 100.75 | 100m | £1.008 | **+0.75%** | 4.50% < 4.62% → accretive ✓ |
| 100% cash (forgone 3% interest) | 19.5 × 0.75 = 14.6 after tax | 115.4 | 100m | £1.154 | **+15.4%** | 2.25% < 4.62% → accretive ✓ |
| 50% stock / 50% debt | 16.25m shares; after-tax interest 14.6 | 115.4 | 116.25m | £0.992 | **(0.75%)** | Blended 4.75% > 4.62% → dilutive ✓ |
| 100% stock + £10m pre-tax synergies | +7.5 after tax | 137.5 | 132.5m | £1.038 | **+3.8%** | Synergies flip it |

- Breakeven synergies for the all-stock deal: PF NI must reach 132.5m × £1.00 = £132.5m, which needs £2.5m after tax, or **£3.33m pre-tax**.

#### Worked example 6: goodwill / PPA (derived)
- Equity purchase price £650m; target book equity £250m (no existing goodwill); identified intangibles written up by £100m.
- DTL = £100m × 25% = **£25m**. Adjusted identifiable net assets = 250 + 100 − 25 = £325m.
- **Goodwill = 650 − 325 = £325m**.
- Under IFRS the goodwill is not amortised (annual IAS 36 test), but the £100m intangible write-up *is* amortised. At 10 years that is £10m pre-tax, or £7.5m after tax per year, which cuts EPS in the accretion model. In the all-stock case above, adding it turns −1.9% into about −7.5%: (130 − 7.5) ÷ 132.5 = £0.925.

#### Teaching notes
- Why buyers pay a premium: synergies (cost and revenue), control (directing strategy and cash flows), competitive tension in auctions, and scarcity of targets. The control-premium range (20–40%) and the synergy test are sourced above; the list itself is my synthesis.
- UK-specific: public takeovers are governed by the Takeover Code. Cash offers require a "cash confirmation" from the financial adviser. Not researched or verified here; see Gaps.

### Gaps
- The UK Takeover Code mechanics often asked in London M&A interviews were not researched: Rule 2.7 firm offer, Rule 24.8 cash confirmation, schemes of arrangement vs contractual offers, the 75% scheme threshold, and the 90% squeeze-out.
- No source was found for typical synergy realisation rates or for the market-reaction literature on stock vs cash deals.

---

## 6. LBO: mechanics, a paper LBO, returns drivers, and what makes a good candidate

### Takeaway
A sponsor buys a company at an entry multiple, funds it with mostly debt (often 5–7x EBITDA in examples) plus an equity cheque, uses free cash flow to pay down debt, and exits after 3–7 years at an exit multiple. Returns come from three levers: EBITDA growth, debt paydown (deleveraging) and multiple expansion; base cases usually assume no expansion. Memorise the 5-year rules of thumb: 2.0x ≈ 15% IRR, 2.5x ≈ 20%, 3.0x ≈ 25%. Good candidates have stable, predictable cash flows, low capex needs, operational levers and a credible exit.

### Cited Findings
- **Paper LBO sequence:** entry EV = entry multiple × EBITDA. Debt = leverage multiple × EBITDA. Equity = EV − debt (plus fees). Project debt paydown from FCF. Exit EV = exit multiple × exit EBITDA. Exit equity = exit EV − net debt. Then compute MOIC and IRR. Example: 8x × $100m = $800m EV, 5x debt = $500m, so sponsor equity is $300m. Doubling to $600m gives 2.0x, about 15% IRR over 5 years. — [Wall Street Prep (paper LBO)](https://www.wallstreetprep.com/knowledge/paper-lbo); [F&E Training (paper LBO)](https://www.fe.training/free-resources/private-equity/paper-lbo/); [ibinterviewquestions (paper LBO)](https://ibinterviewquestions.com/guides/valuation-investment-banking/paper-lbo-setup-execution-worked-examples)
- **IRR rules of thumb (5-year hold):** 2.0x ≈ 15%, 2.5x ≈ 20%, 3.0x ≈ 25%. Shorter holds at the same MOIC give higher IRRs. — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/paper-lbo); [ibinterviewquestions (5-minute paper LBO)](https://ibinterviewquestions.com/blog/paper-lbo-how-to-do-one-in-five-minutes)
- **Paper LBO format:** pen and paper, 5–10 minutes to an implied IRR. A full LBO modelling test is "a near certainty" in later PE rounds. — [Wall Street Prep (1-hour LBO test)](https://www.wallstreetprep.com/knowledge/leveraged-buyout-lbo-modeling-1-hour-practice-test)
- **Return drivers:**
  - Deleveraging requires steady, non-cyclical, non-seasonal cash flows ([Wall Street Prep (deleveraging)](https://www.wallstreetprep.com/knowledge/deleveraging/)).
  - EBITDA growth comes from cost-cutting or growth initiatives, and multiple expansion is treated as upside ([ibinterviewquestions (three levers)](https://ibinterviewquestions.com/guides/valuation-investment-banking/three-value-creation-levers-lbo)).
  - One source puts EBITDA growth at about 40–60% of returns in successful deals and debt paydown at 20–30%. That is a single secondary source ([ibinterviewquestions](https://ibinterviewquestions.com/guides/valuation-investment-banking/three-value-creation-levers-lbo)).
  - Returns are highly sensitive to the exit multiple: in one example, exiting at 7x instead of 9x cut IRR from about 23% to about 15% ([Kubicle](https://www.kubicle.com/blog/leveraged-buyouts-how-to-estimate-your-returns)).
- **Good LBO candidate:** stable, predictable, preferably recurring cash flows (not cyclical), and clear operational levers such as margin improvement and add-ons. — [fffinstill (LBO basics)](https://fffinstill.com/learning/concepts/lbo-model-basics); [Wall Street Prep (deleveraging)](https://www.wallstreetprep.com/knowledge/deleveraging/)
- **LBO modelling test features** (WSP standard): rollover equity, PPA (closing BS, goodwill, DTLs), cash-sweep optionality, PIK interest and sponsor monitoring fees. — [Wall Street Prep (1-hour test)](https://www.wallstreetprep.com/knowledge/leveraged-buyout-lbo-modeling-1-hour-practice-test)

### Inferences
#### Worked example 7: paper LBO in £ (derived; checked in Python)
**Assumptions:**
- Entry EBITDA £100m at **10.0x**, so EV is £1,000m (fees ignored for paper simplicity).
- Debt **6.0x = £600m** at 7% fixed interest on opening balance; sponsor equity **£400m**.
- EBITDA grows £6m a year to £130m in year 5. D&A = capex = £20m a year, ΔNWC = 0, tax 25%.
- 100% cash sweep to debt; exit at year 5 at **10.0x** (no multiple expansion).

| £m | Y1 | Y2 | Y3 | Y4 | Y5 |
|---|---|---|---|---|---|
| EBITDA | 106.0 | 112.0 | 118.0 | 124.0 | 130.0 |
| − D&A | (20.0) | (20.0) | (20.0) | (20.0) | (20.0) |
| EBIT | 86.0 | 92.0 | 98.0 | 104.0 | 110.0 |
| − Interest (7% × opening debt) | (42.0) | (39.7) | (36.9) | (33.7) | (30.0) |
| PBT | 44.0 | 52.3 | 61.1 | 70.3 | 80.0 |
| − Tax 25% | (11.0) | (13.1) | (15.3) | (17.6) | (20.0) |
| Net income | 33.0 | 39.2 | 45.8 | 52.7 | 60.0 |
| FCF to repay debt (NI + D&A − capex) | 33.0 | 39.2 | 45.8 | 52.7 | 60.0 |
| Closing debt | 567.0 | 527.8 | 482.0 | 429.3 | 369.3 |

- Exit EV = 10.0x × £130m = £1,300m. Exit equity = 1,300 − 369.3 = **£930.7m**.
- **MOIC = 930.7 ÷ 400 = 2.33x**, so **IRR = 2.33^(1/5) − 1 = 18.4%**.
- Returns attribution: equity gain £530.7m = EBITDA growth (£30m × 10.0x = £300m, 57%) + debt paydown (£230.7m, 43%) + multiple expansion (£0).
- Sensitivity on exit multiple:

| Exit multiple | Exit equity | MOIC | IRR |
|---|---|---|---|
| 9.0x | £800.7m | 2.00x | 14.9% |
| 10.0x | £930.7m | 2.33x | 18.4% |
| 11.0x | £1,060.7m | 2.65x | 21.5% |

- Rule-of-thumb verification, computed exactly:
  - Over 5 years: 2.0x = 14.9%, 2.5x = 20.1%, 3.0x = 24.6%, confirming the cited ≈15/20/25%.
  - Over 3 years: 2.0x = 26.0%, 2.5x = 35.7%, 3.0x = 44.2%.
- Paper-LBO shortcut: to hit a target IRR, solve backwards. A 20% IRR over 5 years needs about 2.5x, so exit equity must be about £1,000m. With exit net debt of about £369m, exit EV must be about £1,369m, or about 10.5x on £130m. That is the multiple expansion required.

#### Sources & uses for the same deal, with fees (derived)
| Uses | £m | Sources | £m |
|---|---|---|---|
| Purchase of equity | 700 | Term Loan B (4.5x) | 450 |
| Refinance target net debt | 300 | Senior secured notes (1.5x) | 150 |
| Transaction & financing fees | 25 | Sponsor equity (plug) | 425 |
| **Total** | **1,025** | **Total** | **1,025** |

- Including fees raises the equity cheque from £400m to £425m and cuts the IRR to about 17.0% (930.7 ÷ 425 = 2.19x). This is the "omitting fees overstates returns" point from A Simple Model and ibinterviewquestions.

#### Teaching notes
- Good LBO candidate checklist (synthesis):
  - Stable, recurring free cash flow.
  - Low or maintainable capex and working-capital needs.
  - Strong market position and pricing power.
  - Asset base or collateral that supports debt.
  - Cost-saving or buy-and-build levers.
  - A strong management team.
  - Reasonable entry valuation.
  - Clear exit routes (trade sale, secondary buyout, IPO).
- Only the cash-flow stability and operational-lever points are directly sourced; the rest is standard practitioner consensus not verified here.

### Gaps
- No current (2026) data was found on typical European LBO leverage multiples or equity contributions. The only figures were 3–4x senior / 4–6x unitranche from a French advisory blog (see Section 7).
- No authoritative breakdown of value creation across PE funds (e.g., academic or Bain/McKinsey) was retrieved.

---

## 7. Capital markets basics for ECM and DCM: IPO process (UK), follow-ons, convertibles, high yield vs investment grade, leveraged finance

### Takeaway
**ECM:** a London IPO typically takes 6+ months. The sequence is:
1. Intention to Float (ITF) announcement, preceded by unconnected-analyst research under the FCA research rules.
2. Approved prospectus.
3. Price range.
4. About 2 weeks of bookbuilding and roadshow.
5. Pricing and allocation.
6. Stabilisation via a 15% greenshoe.
7. Typically 180-day lock-ups.

UK follow-ons are mostly placings and accelerated bookbuilds (ABBs) within the Pre-Emption Group's 10% + 10% (+2% follow-on) disapplication guidance, or rights issues priced against TERP. The UK prospectus regime changed on 19 January 2026. European IPO gross spreads (about 1.25–5%) are well below the US "7% solution".

**DCM:** investment grade (IG) is BBB−/Baa3 and above. High yield (HY) carries fixed coupons, call protection and incurrence covenants. Leveraged loans (Term Loan B) float and are now mostly cov-lite. Private-credit unitranche competes with both. Convertibles trade a lower coupon for an equity option struck at a 10–50% conversion premium.

### Cited Findings
**UK IPO process**
- The ITF is the issuer's first public statement of intent to float on the Main Market, AIM or Euronext Dublin. It summarises the business, strategy, investment highlights, offer features and timetable. It is market practice, not a legal requirement. — [LexisNexis (ITF guidance)](https://www.lexisnexis.com/en-gb/legal/guidance/intention-to-float-announcements-in-main-market-aim-ipos); [LexisNexis (glossary)](https://www.lexisnexis.com/en-gb/legal/glossary/intention-to-float)
- Under FCA research rules, a company may publish an "expectation of intention to float" and then a confirmatory ITF, so that unconnected analysts can write research before marketing. A Bloomberg report said the FCA was considering scrapping the two-stage system; the outcome was not confirmed. — [MoneyAM (Bloomberg report)](https://old.moneyam.com/action/news/showArticle?id=7375308)
- The prospectus is reviewed and approved by the UK Listing Authority (FCA) and can take several drafts. Price ranges are often set in a separate approved price-range prospectus; the Pets at Home 2014 IPO timetable is an example. A Main Market IPO usually takes at least 6 months, and roadshows typically run about 2 weeks. — [Cooley GO](https://www.cooleygo.com/ipos-in-the-uk-whats-involved/); [Pets at Home IPO timetable](https://www.petsathomeplc.com/media/p3jpffvp/pets-at-home-timetable.pdf); [Morningstar UK](https://morningstar.co.uk/uk/news/210843/the-timeline-of-an-ipo.aspx)
- The UK prospectus framework was reformed effective **19 January 2026**. The POATRs (SI 2024/105) and the FCA PRM sourcebook replaced the UK Prospectus Regulation, sharply reducing when an FCA-approved prospectus is needed for further share issues. The search summary's attribution of this point was unclear, so verify on FCA/legislation.gov.uk. — [Cooley GO](https://www.cooleygo.com/ipos-in-the-uk-whats-involved/)
- **Greenshoe / over-allotment:** underwriters sell up to 15% more shares than the base deal, creating a short. If the price rises, they cover by exercising the option at the offer price. If it falls, they buy in the market, which supports the price. The window is typically 30 days. Example: a 10m-share deal sells 11.5m. — [Noble Desktop](https://blog.nobledesktop.com/learn/financial-modeling/ipo-aftermarket-price-stabilization); [ibinterviewquestions (greenshoe)](https://ibinterviewquestions.com/blog/greenshoe-option-over-allotment-explained); [Upstox](https://upstox.com/learning-center/ipo/what-is-greenshoe-option-in-ipo/)
- **Lock-ups:** selling shareholders in London IPOs typically face 180-day restrictions. Recent cornerstone investments in London IPOs have carried 180-day lock-ups. — [Wise](https://wise.com/gb/blog/ipo-lockups); [Latham & Watkins](https://www.latham.london/2019/06/cornerstone-investments-and-private-equity-sponsored-ipo-exits/)
- **Fees:** US IPOs cluster at a 7% gross spread. European IPO fees run about 3 percentage points lower, typically 3–5% and sometimes as low as 1.25%. A later thesis (2008–2018 sample) found the gap had narrowed. These studies are dated (2003–2018). — [Oxford (ORA)](https://ora.ox.ac.uk/objects/uuid:cf406437-7ba7-4fec-aa1a-2425e86b426f/files/m1b5a7f71847b307e8865a2a7b066dea8); [vLex (European gross spreads)](https://eu.vlex.com/vid/what-determines-ipo-gross-856420140); [Aalto University](https://aaltodoc.aalto.fi/items/618c86fa-48eb-4af1-8328-b5e7f8c982d0)

**UK follow-ons**
- **Pre-Emption Group Statement of Principles (4 November 2022):** companies may seek authority to disapply pre-emption rights for up to 20% of issued share capital. That is 10% for general corporate purposes plus 10% for an acquisition or specified capital investment (announced at the time or within the prior 12 months), plus up to 2% for a follow-on offer to retail and existing holders. This was up from 5% + 5% in 2015. Follow-on offers are limited to 20% of the placing size and £30,000 per beneficial owner, and post-transaction reports are expected. Sources differ on whether the 2% applies once or per limb. — [Covington](https://www.cov.com/en/news-and-insights/insights/2022/11/new-peg-statement-of-principles-on-the-disapplication-of-pre-emption-rights); [Gowling WLG](https://gowlingwlg.com/en/insights-resources/articles/2022/pre-emption-group-updated-statement-of-principles); [Arthur Cox](https://www.arthurcox.com/insights/pre-emption-group-issues-revised-statement-of-principles/); [BCLP](https://www.bclplaw.com/en-US/insights/revised-pre-emption-group-statement-of-principles.html)
- **Rights issues vs placings:** the UK has rights issues, open offers and placings. Smaller listed companies have shifted from rights issues to placed-share structures. Rights issues use larger discounts to protect underwriters. — [ECGI / Armitage](https://www.ecgi.global/sites/default/files/working_papers/documents/SSRN-id389001.pdf); [ACT, The Treasurer (2009)](https://www.treasurers.org/ACTmedia/Oct09TTRightsIssue40-42.pdf)
- **TERP = (existing shares × current price + new shares × issue price) ÷ total shares.** Example: a 4-for-9 issue at 153p with shares at 247p gives TERP ≈ 218p. A 1-for-5 at $30 with the stock at $50 gives ≈ $46.67. — [Sharescope](https://www.sharescope.co.uk/philoakley_article45.jsp); [ibinterviewquestions (rights offerings)](https://ibinterviewquestions.com/guides/equity-capital-markets/rights-offerings-mechanics-subscription-oversubscription)

**Convertible bonds**
- A convertible is a straight bond plus an embedded call option on the issuer's shares. The conversion price is the reference share price plus a conversion premium, typically 10–50% and about 15–25% in one academic sample. A higher premium requires a higher coupon, and a high-premium convert is more "debt-like". Coupons are lower than straight debt. Issuers use converts for a lower coupon, to sell equity at a premium (less dilution), and for speed (often launched and priced the same day, without a rating or roadshow). Uses include growth capital, refinancing, M&A and buybacks. Principal is repaid in cash if not converted. — [Mayer Brown](https://www.mayerbrown.com/-/media/files/perspectives-events/events/2020/07/convertible-bonds--understanding-the-key-benefits.pdf); [ACT, The Treasurer (2012)](https://www.treasurers.org/ACTmedia/Oct12TTconvertibles36-37.pdf); [Treasury & Risk](https://treasuryandrisk.com/2013/09/04/why-consider-convertible-bonds); [Ryan O'Connell (converts)](https://ryanoconnellfinance.com/convertible-bonds/); [Redwheel FAQ](https://www.redwheel.com/uploads/2021/04/b7d431e314e6d31122e48f8c77f836fb/rwc-convertible-bonds-faq.pdf)

**High yield vs investment grade; leveraged finance**
- HY = rated below BBB− (S&P/Fitch) or Baa3 (Moody's). IG documentation is short and standardised with few restrictions. HY indentures limit debt incurrence, dividends and asset sales. — [VectorShift (HY)](https://vectorshift.ai/glossary/high-yield-bond); [ibinterviewquestions (IG vs HY)](https://ibinterviewquestions.com/blog/investment-grade-vs-high-yield-bonds)
- Maintenance covenants are tested continuously, typically in bank loans. Incurrence covenants restrict actions only when the borrower takes them, typically in HY. Cov-lite loans grew from just over 10% of leveraged loans in 2007 to more than 80% in 2020. Triggered incurrence covenants still cut investment by about 1.8 percentage points, versus 0.9 points for maintenance violations. — [Boston Fed working paper](https://www.bostonfed.org/publications/research-department-working-paper/2022/high-yield-debt-covenants-and-their-real-effects); [Dallas Fed WP 2311](https://www.dallasfed.org/-/media/documents/research/papers/2023/wp2311.pdf)
- HY bonds carry fixed coupons, bullet maturities and call protection. Leveraged loans float over a reference rate (SOFR, or SONIA/EURIBOR in £/€ markets), are prepayable and often amortise. — [VectorShift](https://vectorshift.ai/glossary/high-yield-bond); [Marquette Associates](https://www.marquetteassociates.com/wp-content/uploads/2023/12/Were-Not-So-Different-High-Yield-Bonds-and-Leveraged-Loans.pdf)
- Unitranche is a single blended senior/junior loan under one agreement, usually from private debt funds, sized about €10m to €2bn. At the top end it competes with HY and European TLB. Its blended rate is below unsecured HY but similar to or above senior secured HY. European structures combine senior secured notes, super-senior RCFs (historically capped around 1x EBITDA) and subordinated debt. — [Jones Day](https://www.jonesday.com/-/media/files/publications/2020/11/unitranche-financing/unitranche_financingan_introduction.pdf); [De Brauw](https://debrauw.com/articles/comparing-alternative-financing-options-for-leveraged-borrowers); [Ashurst (2014)](https://www.ashurst.com/-/media/ashurst/documents/news-and-insights/legal-updates/2014/sep/european-leveraged-finance-funding-structures-transformed-september-2014.pdf)
- Indicative 2025 French market leverage: senior secured 3–4x EBITDA, unitranche 4–6x. This is a single secondary source. — [Hayot Expertise](https://hayot-expertise.fr/en/blog/leveraged-finance-france-2026)

### Inferences
- Worked TERP in £ (derived): shares at 400p, 1-for-4 rights issue at 300p. TERP = (4 × 400 + 1 × 300) ÷ 5 = **380p**. The value of one nil-paid right is 380 − 300 = 80p. The discount to TERP is 300 ÷ 380 − 1 = −21.1%.
- Worked convert (derived): shares at £10.00 with a 30% conversion premium give a conversion price of £13.00. A £100,000 bond converts into 7,692 shares (conversion ratio = 100,000 ÷ 13). The holder converts at maturity only if the share price exceeds £13.00.
- Interview framing for ECM/DCM candidates: know the IPO steps in order, why issuers choose ABBs over rights issues (speed, lower discount), the greenshoe mechanics, and IG vs HY and loans vs bonds. Know one recent London deal in detail. The deal suggestion comes from spring-week sources in Section 9.

### Gaps
- UK Listing Rules reform (the July 2024 merger of premium and standard segments into a single commercial-companies category) is relevant to ECM interviews, but no source was retrieved. Some PEG sources above still refer to "Premium Listing", which is now outdated.
- No verified current data on UK IPO fees, cornerstone practice, or whether the FCA abolished the two-stage ITF research process.
- European leverage norms, TLB pricing and current SONIA/EURIBOR conventions were not verified with 2026 data.

---

## 8. Financial modelling skills expected: Excel, 3-statement models, London modelling tests, PowerPoint/pitchbooks

### Takeaway
Banks expect fast, mouse-light Excel: shortcuts, INDEX/MATCH or XLOOKUP, SUMIFS, data tables and clean formatting. Analysts should be able to build a linked 3-statement model, DCF, comps and a simple LBO or merger model, and produce clean pitchbook slides. Modelling tests appear mainly in later rounds and for PE, lateral or associate hires. Formats range from a 15-minute paper exercise to a 3-hour Excel build. A typical LBO test takes about 45–60 minutes; 90 minutes for associate-level PE. Spring week and most undergraduate summer interviews in London rarely include full modelling tests.

### Cited Findings
- Most institutional modelling tests are either an integrated 3-statement model or an LBO. Time allowed ranges from a 15-minute paper exercise to a 3-hour Excel build. — [Intervyo (UK, Excel modelling test)](https://www.intervyo.co.uk/assessments/excel-modelling-test)
- WSP's basic LBO test takes about 45 minutes (an hour at most) and is near-certain in later PE rounds. F&E Training's 90-minute LBO test is described as typical of associate-level interviews at middle-market PE firms, graded first on structural correctness. — [Wall Street Prep (1-hour LBO test)](https://www.wallstreetprep.com/knowledge/leveraged-buyout-lbo-modeling-1-hour-practice-test); [F&E Training (90-minute LBO test)](https://www.fe.training/?p=10088604)
- A London M&A candidate at ING (April 2019) reported a first round of motivational and technical questions, then an Excel modelling test. This is a single anonymous account. — [Glassdoor (ING)](https://www.glassdoor.com/Interview/ING-Interview-E4264-RVW25511546.htm)
- Excel skills commonly cited:
  - Keyboard shortcuts with minimal mouse use.
  - XLOOKUP, INDEX/MATCH and SUMIFS.
  - Power Query and PivotTables.
  - Basic VBA.
  - WSP is repeatedly named as a source of a banking-specific shortcut list.
  - These come from resume-advice sites, so they are commercial and low-authority. — [ResumeCat](https://resumecat.com/blog/investment-banking-analyst-skills)
- PowerPoint and pitchbooks: clean slide structure, consistent templates and charts that tell a story. Pitchbooks cover company valuation, industry research and M&A opportunities. CFI offers a pitchbook-focused PowerPoint course. — [ResumeCat](https://resumecat.com/blog/investment-banking-analyst-skills); [NASBA registry (CFI PowerPoint & Pitchbook)](https://www.nasbaregistry.org/course-library/powerpoint--pitchbook)
- Macabacus, an Excel/PowerPoint add-in widely used for modelling and deck building, offers free on-demand training via CFI, including a Quick Start Guide on setup and shortcuts. CFI students get free add-in access, and there is a 14-day free trial. — [Macabacus on-demand training](https://macabacus.com/on-demand-training); [NASBA (Macabacus Fundamentals)](https://www.nasbaregistry.org/course-library/macabacus-fundamentals); [Macabacus trial page](https://macabacus.com/lp/financial-modeling-excel-trial)
- Training The Street's university and bank-style curriculum includes Intro to Excel, Corporate Valuation, LBO Modeling, M&A Modeling, Advanced Excel and PowerPoint. Its modules include Trading Comps, Acquisition Comps, DCF, M&A, LBO and deferred taxes. — [UNC (TTS programme)](https://careerandleadership.unc.edu/vendor-resources/training-the-street/); [S&P Global (TTS modules)](https://pages.marketintelligence.spglobal.com/European-Investment-Bank-Training-the-Street.html)

### Inferences
- Minimum modelling skill set by stage (synthesis):
  - *Spring week:* basic Excel and the ability to explain the three statements.
  - *Summer internship:* explain a DCF and comps verbally; build a simple 3-statement model from scratch in 60–90 minutes.
  - *Analyst / full-time:* a full 3-statement model with debt schedule and circularity switch, a DCF with sensitivity tables, a comps sheet with calendarisation, a merger model, and a 45–60-minute LBO test. Also pitchbook formatting at speed.
- Practice plan: rebuild the R&P companion models from blank sheets; time yourself on WSP/F&E-style 60–90-minute LBO tests; learn shortcuts with Macabacus's free training.

### Gaps
- No London-bank-specific data (2025–26) on the share of analyst or intern processes that include timed modelling tests, or on typical durations. Evidence is anecdotal (Glassdoor).
- No authoritative published Excel shortcut list could be fetched. WSP's list is referenced but was not retrieved.

---

## 9. The most common technical interview questions (with model answers), and how depth differs between spring week, summer internship and full-time in the UK

### Takeaway
UK spring-week interviews are mostly behavioural and motivational: why this bank, why this division, a recent deal or market event. Technical content is minimal or absent at many banks, though some ask basics. Summer internship processes, especially second rounds and superdays (often 3–6 back-to-back interviews of 30–45 minutes), are where core technicals are tested: accounting, EV, DCF, multiples, M&A and LBO basics. Graduate assessment centres add group exercises, case studies and in-tray tasks. Modelling tests are mostly reserved for later rounds, off-cycle or experienced hires, and PE.

### Cited Findings
**Depth by stage (UK)**
- Spring week interviews are primarily behavioural: motivation, firm knowledge, reflecting on experience. Technical questions are usually minimal. Candidates should know markets, current events, interest rates and basic macro, and start valuation basics in first year. — [F&E Training (spring weeks)](https://www.fe.training/free-resources/careers-in-finance/investment-banking-careers-spring-week-internships); [ibinterviewquestions (UK spring weeks)](https://ibinterviewquestions.com/blog/spring-weeks-uk-investment-banking-guide)
- Glassdoor reports vary:
  - UBS spring week: "standard… nothing too technical", with a focus on motivation and situational judgement.
  - Another UBS report: a mix of behavioural, logical and technical questions, including naming a recent deal and how it affects the bank.
  - A J.P. Morgan spring-week candidate: all competency questions, no technicals.
  - — [Glassdoor UBS review](https://www.glassdoor.co.uk/Interview/UBS-Interview-E3419-RVW8498592.htm); [Glassdoor UBS review 2](https://www.glassdoor.co.uk/Interview/UBS-Interview-E3419-RVW5751683.htm); [Glassdoor spring intern questions](https://static.glassdoor.com.br/Interview/spring-intern-interview-questions-SRCH_KO0,13_IP205.htm)
- Spring weeks themselves often include technical training, such as an introduction to accounting and Excel and a practice valuation. — [F&E Training](https://www.fe.training/free-resources/careers-in-finance/investment-banking-careers-spring-week-internships); [Lancaster University LUMS](https://www.lancaster.ac.uk/lums/our-departments/accounting-and-finance/blogs/investment-banking-spring-weeks)
- Internship processes may have second-round interviews that are "often more technical" and may be the final round. Graduate roles typically use assessment centres with 2–4 interviews (one-to-ones and panels). — [TargetJobs](https://targetjobs.co.uk/careers-advice/accountancy-banking-and-finance/example-investment-banking-interview)
- In London, "assessment centre" often means a full day of interviews plus group exercises, case studies or e-tray tasks. "Superday" traditionally means multiple interviews in one visit. — [Finbound](https://www.finbound.org/blog/superday-investment-banking-guide)
- Superdays typically have 3–6 back-to-back interviews of 30–45 minutes each. — [IGotAnOffer](https://igotanoffer.com/en/advice/investment-banking-superday-interviews)
- The summer internship is effectively "a 10-week interview" for the return offer. — [LearnSignal (UK)](https://www.learnsignal.com/blog/how-to-become-an-investment-banker-uk/)
- For PE or lateral roles: paper LBOs (5–10 minutes) in earlier rounds, and LBO modelling tests in later rounds. — [Wall Street Prep](https://www.wallstreetprep.com/knowledge/leveraged-buyout-lbo-modeling-1-hour-practice-test)

**Core question bank: underlying sources**
- The question bank below draws on the sourced mechanics in Sections 1–7. The "walk me through a DCF" and levered-vs-unlevered framing comes from [Wall Street Prep (top 10 IB interview questions)](https://www.wallstreetprep.com/knowledge/top-10-investment-banking-interview-questions), [Street of Walls (DCF)](https://www.streetofwalls.com/finance-training-courses/investment-banking-technical-training/discounted-cash-flow/), and [ibinterviewquestions (walk me through a DCF)](https://ibinterviewquestions.com/guides/valuation-investment-banking/walk-me-through-dcf-verbal-framework).
- The BIWS "400 Questions" guide covers accounting, valuation, DCF, merger models, LBO models, restructuring/distressed M&A and brain teasers; the coverage description comes from an unofficial copy. — [docshare listing](https://docshare.wps.com/template/the-400-investment-banking-interview-questions-answers-read-online-free/173242/_payload.json)

### Inferences
#### Question bank: 50 common technical questions with concise model answers (£, IFRS-aware)
Tags: **[S]** = may appear at spring week (basic); **[I]** = summer internship / graduate; **[A]** = advanced / analyst / PE. Answers are synthesised from the sourced mechanics in Sections 1–7, with the section noted for each.

**Accounting (Section 1)**
1. **[S] Walk me through the three financial statements.** The IS shows revenue, expenses and profit over a period, ending in net income. The BS is a snapshot of assets = liabilities + equity at a point in time. The CFS reconciles net income to the change in cash across operating, investing and financing activities.
2. **[S/I] How do they link?** Net income flows to the top of the CFS and, less dividends, into retained earnings. Non-cash items and working-capital changes adjust CFO. Capex and D&A move PP&E. Debt movements go through CFF. Ending cash flows to the BS.
3. **[I] Depreciation rises by £10 at a 25% tax rate. Walk it through.** NI −£7.50; CFS +£10 add-back, so cash +£2.50; BS PP&E −£10, cash +£2.50, retained earnings −£7.50. Balances (see Section 1).
4. **[I] If you had only one statement, which would you choose?** The CFS, because it shows real cash generation, though the BS is needed for leverage. Many guides give the CFS answer; this is synthesis and not directly sourced.
5. **[I] A company buys £100 of inventory with cash.** No IS effect. CFO −£100 (increase in inventory). BS: cash −100, inventory +100.
6. **[I] Receivables rise by £20. Effect on cash?** CFO falls by £20. Cash is tied up in working capital even though revenue was booked.
7. **[I] What is working capital and why exclude cash and debt?** Operating current assets minus operating current liabilities. Cash and debt are financing items, not operating capital.
8. **[I] What is a deferred tax liability?** Tax expected to be paid in future because book profit currently exceeds taxable profit on a temporary difference, for example accelerated tax depreciation. DTL = difference × tax rate.
9. **[I] How is goodwill created and what happens on impairment?** Goodwill = price − fair value of identifiable net assets, including write-ups less the DTL. Under IFRS it is not amortised and is tested annually at CGU level. An impairment cuts NI and goodwill, is added back on the CFS (cash unaffected unless tax-deductible), and can never be reversed.
10. **[I/A] How does IFRS 16 change EBITDA and leverage?** Lease cost moves from opex to depreciation + interest, so EBITDA rises. Lease liabilities are debt-like, so net debt and EV rise. US GAAP operating leases keep a single expense above EBITDA, so make comps consistent or use EBITDAaL.
11. **[A] Where does interest paid sit in the cash flow statement?** US GAAP: operating. IFRS today: a choice of operating or financing. IFRS 18 (from 1 January 2027): financing for most corporates, with interest and dividends received in investing.
12. **[A] Name IFRS vs US GAAP differences relevant to valuation.** Leases (IFRS 16 vs ASC 842); no LIFO under IFRS; capitalised development costs (IAS 38); impairment reversals allowed except goodwill; PP&E revaluation option; cash-flow classification.

**Enterprise value and equity value (Section 2)**

13. **[S/I] What's the difference between enterprise value and equity value?** EV is the value of the operations to all capital providers. Equity value is the value to common shareholders only (diluted shares × price).
14. **[I] How do you get from equity value to EV?** Add debt (and IFRS 16 leases if EBITDA is pre-lease), preferred, NCI and debt-like items such as pension deficits. Subtract cash and non-operating assets such as associates.
15. **[I] Why add NCI and subtract associates?** For consistency with EBITDA. Consolidated EBITDA includes 100% of subsidiaries, so add the minority's claim. Associates' profits are not in EBITDA, so remove their value.
16. **[I] Why subtract cash?** It is a non-operating asset. EV prices the operating business, and a buyer effectively recoups the cash.
17. **[I] A company raises £100m of debt (or issues £100m of equity) and holds the cash. What happens to EV?** Nothing. The claim and the cash offset.
18. **[A] Can EV be negative? Can equity value be negative?** EV can be, if cash exceeds market cap plus debt (rare, and a sign of distress or mispricing). Market equity value cannot be negative; book equity can.
19. **[I] How do you calculate diluted shares?** The treasury stock method. Example: 10m options at £3.00 with shares at £5.00 means proceeds of £30m buy back 6m shares, so 4m net new shares.
20. **[I] Which multiples go with EV and which with equity value?** EV goes with EBITDA, EBIT and revenue. Equity value goes with net income (P/E) and book value (P/BV). EV/net income is inconsistent.
21. **[A] How do you treat a UK defined-benefit pension deficit?** As a debt-like item added to EV, sometimes tax-effected depending on bank convention.

**Valuation (Section 3)**

22. **[S/I] What are the main valuation methods?** Trading comps, precedent transactions, DCF and LBO, plus SOTP for multi-segment groups. Usually shown together on a football field.
23. **[I] Which typically gives the highest value and why?** Precedents, because they embed a control premium (around 20–40%) and synergies. Comps are usually lowest. A DCF can be highest if the assumptions are aggressive.
24. **[I] Walk me through a DCF.** Project UFCF for 5–10 years. Compute a terminal value with Gordon growth or an exit multiple. Discount both at WACC to get EV. Bridge to equity value and divide by diluted shares.
25. **[I] How do you calculate UFCF?** EBIT × (1 − t) + D&A − capex − ΔNWC.
26. **[I] What is WACC and how do you calculate the cost of equity?** WACC = E/V × Re + D/V × Rd × (1 − t), using market weights. Re = Rf + β × ERP (CAPM).
27. **[I/A] How do you get beta for a private company?** Take peer levered betas and unlever each with β_U = β_L ÷ [1 + (1 − t) × D/E]. Take the average or median, then relever at the target's capital structure (Damodaran's bottom-up beta).
28. **[I] Why is the cost of debt lower than the cost of equity?** Debt is senior and secured, with contractual payments, and interest is tax-deductible.
29. **[A] What happens to WACC as leverage rises?** At first it falls, because more weight goes on cheaper after-tax debt. Then it rises as the costs of both debt and equity climb with distress risk. This is synthesis (trade-off theory), not directly sourced.
30. **[I] Gordon growth vs exit multiple: which is better?** Gordon is more intrinsic but very sensitive to g (keep it at or below long-run nominal GDP). The exit multiple is market-based but brings relative valuation into the DCF. Use both and cross-check implied g and implied multiple. TV is often 60–80% of EV.
31. **[A] What is the mid-year convention and what does it do?** It discounts each year's cash flow at t − 0.5 to reflect flows during the year. It raises the value, often by about 3–5%. Treat the TV consistently.
32. **[I] What's the difference between levered and unlevered DCFs?** Levered FCF is after interest, discounted at the cost of equity, and gives equity value. Unlevered FCF is discounted at WACC and gives EV.
33. **[A] How would you value a company with negative cash flows?** Use a DCF with a longer projection to steady state. Use EV/Revenue multiples. Consider VC-style or scenario approaches.
34. **[A] When would you use a sum-of-the-parts?** For conglomerates with unrelated segments, or to analyse a spin-off or carve-out. Value each segment on its own peers and multiples, sum them, and consider a conglomerate discount.

**Sector-specific valuation (Section 4)**

35. **[A] How do you value a bank?** P/TBV against ROTE and cost of equity, using justified P/TBV = (ROE − g) ÷ (COE − g). Also P/E and DDM. Not EV/EBITDA, because debt and interest are operating items for a bank.
36. **[A] How do you value a REIT?** Use P/FFO and P/AFFO, where FFO = NI + real-estate D&A − gains on sales. Also use NAV, built from NOI ÷ cap rate less debt.
37. **[A] How do you value a life insurer?** Use embedded value (ANAV + value of in-force) and P/EV, plus P/BV.

**M&A (Section 5)**

38. **[I] Walk me through a merger model.** Project both companies. Set the purchase price and funding mix. Run the PPA (goodwill, write-ups, DTL). Combine the income statements with adjustments: forgone interest on cash, new interest, new amortisation, synergies. Compute pro forma EPS against the acquirer's standalone EPS.
39. **[I] What's the quick accretion/dilution test?** For stock, accretive if acquirer P/E > offer P/E. For debt or cash, accretive if the after-tax cost is below the target's earnings yield at the offer price.
40. **[I] Why would a buyer pay a premium?** Synergies, control, competitive auction tension and scarcity. It is value-creating only if the PV of net synergies exceeds the premium.
41. **[I] Cash or stock: what drives the choice?** Cash signals confidence and is often more accretive when debt is cheap. Stock shares risk with target holders and preserves the balance sheet. Target holders' tax position also matters.
42. **[A] What creates a DTL in an acquisition?** Asset write-ups that are not tax-deductible. DTL = write-up × t, which increases goodwill.
43. **[I] What is a sources-and-uses table?** Uses are the equity price, refinanced debt and fees. Sources are the debt tranches, equity and rollover. Equity is the plug, and the two sides must match.

**LBO (Section 6)**

44. **[I] Walk me through an LBO.** Set the entry price (multiple × EBITDA) and the debt and equity mix. Project FCF and debt paydown. Set the exit at a multiple × exit EBITDA, less net debt. Compute MOIC and IRR.
45. **[I/A] A company is bought at 10x £100m EBITDA with 6x debt. EBITDA grows to £130m, debt falls to about £369m, and you exit at 10x after 5 years. What are MOIC and IRR?** Exit equity £931m on £400m invested gives about 2.3x and about 18%.
46. **[I] What drives LBO returns?** EBITDA growth, debt paydown and multiple expansion. Leverage magnifies returns, and losses too.
47. **[I] What makes a good LBO candidate?** Stable, recurring cash flow; low capex; operational levers; strong market position; supportable collateral; sensible price; clear exit.
48. **[I] Why use leverage at all?** A smaller equity cheque magnifies returns, and interest is tax-deductible. The cost is higher risk.

**Capital markets (Section 7)**

49. **[I] What's the difference between investment grade and high yield?** IG is BBB−/Baa3 or better, with light documentation. HY is below that, with incurrence covenants, a fixed coupon and call protection. Leveraged loans are floating-rate and mostly cov-lite.
50. **[I] Why would a company issue a convertible?** Lower coupon than straight debt, effectively selling equity at a 10–50% premium, and speed. The downside is cash repayment if it is not converted.

Bonus ECM questions:
- *Walk me through a UK IPO:* ITF, then prospectus approval, price range, about 2 weeks of bookbuild and roadshow, pricing, a 15% greenshoe, and 180-day lock-ups.
- *What is TERP?* (Existing shares × price + new shares × issue price) ÷ total shares.

#### Interpretation
- For spring weeks, prioritise questions 1, 2, 13 and 22, plus commercial awareness. For summer internships, master questions 1–50 at the [S] and [I] level. Full-time and off-cycle candidates, and anyone targeting PE or lateral moves, should add the [A] tier and timed modelling. UK candidates gain an edge with the IFRS 16 and IFRS 18 points, which most US-centric prep omits.

### Gaps
- No bank-published statement of technical expectations by stage was found. The evidence is careers-service blogs and anonymous Glassdoor reports.
- Could not retrieve M&I/BIWS's actual question lists to confirm frequency rankings. The 50 questions above are assembled from recurring themes across WSP, BIWS, Street of Walls, F&E and the interview-prep aggregators, not from frequency data.
- Brain teasers and market-sizing questions sometimes asked in UK interviews were not researched.

---

## 10. Best resources (books, paid courses, free resources), what is worth paying for, and reputation differences

### Takeaway
A strong low-cost path:
1. Free: Damodaran Online, A Simple Model, Macabacus training, F&E/Felix free resources, and the WSP/BIWS/M&I/CFI free articles. Plus the Vault Guide, which many universities provide free.
2. One core book: Rosenbaum & Pearl, *Investment Banking* (3rd ed., with six companion models).
3. At most one paid course.

On reputation, community opinion (Wall Street Oasis) tends to rate BIWS highest for interview-question realism and technical depth, and WSP highest for learning to model (WSP also has bank-training heritage). CFI's FMVA is broad, subscription-priced, and its employer recognition is disputed. Training The Street mainly serves banks' own analyst training.

### Cited Findings
**Books**
- Rosenbaum & Pearl, *Investment Banking: Valuation, LBOs, M&A, and IPOs*, 3rd edition (Wiley, release announced for April 2020). It added IPO, direct listing and SPAC content, with contributions from Nasdaq, Latham & Watkins, Merrill and Altrum, and six downloadable model templates. — [Wiley press release](https://investors.wiley.com/news/news-details/2020/Wiley-to-Publish-Final-Installment-of-Renowned-Little-Book-Series-by-Joshua-Pearl-and-Joshua-Rosenbaum-and-the-Updated-Edition-of-the-Global-Best-Seller-Investment-Banking-to-Help-Investors-and-Companies-Navigate-Todays-Dynamic-Market-2020-3-19/default.aspx); [O'Reilly](https://oreilly.com/library/view/investment-banking-3rd/9781119867876)
- *Vault Guide to Finance Interviews*, 9th edition. It covers corporate valuation, equities, bonds and interest rates, and M&A, with sample questions and practice cases. Many university careers services list it (Cornell, Penn, Yale SOM, UCLA), often with free access for students. — [Cornell Career Services](https://career.cornell.edu/resources/vault-guide-to-finance-interviews-9th-edition/); [Penn Career Services](https://careerservices.upenn.edu/resources/vault-guide-to-finance-interviews-9th-edition/)
- BIWS *400 Investment Banking Interview Questions & Answers* covers accounting, valuation, DCF, merger and LBO models, restructuring/distressed and brain teasers. The coverage comes from an unofficial copy; check the BIWS site. — [docshare listing](https://docshare.wps.com/template/the-400-investment-banking-interview-questions-answers-read-online-free/173242/_payload.json)

**Free resources**
- **Damodaran Online (NYU Stern):** free full courses (MBA, plus online valuation, corporate finance and investment philosophies classes), annual industry datasets (betas, ERPs, multiples, US and global), and valuation spreadsheets. — [Damodaran Online home](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm); [Internet Scout description](https://archives.internetscout.org/r1091/damodaran_on-line)
- **A Simple Model:** free, beginner-oriented video lessons on 3-statement, DCF and LBO models with downloadable templates. Its "on par with bulge-bracket summer intern training" claim is self-promotional. — [A Simple Model resources](https://www.asimplemodel.com/resources/); [A Simple Model: where to learn modelling](https://www.asimplemodel.com/insights/where-to-learn-financial-modeling); [Noble Desktop (free modelling options)](https://blog.nobledesktop.com/learn/financial-modeling/learn-financial-modeling-for-free)
- **Macabacus:** free on-demand training (via CFI) and free add-in access for CFI students. — [Macabacus training](https://macabacus.com/on-demand-training); [NASBA](https://www.nasbaregistry.org/course-library/macabacus-fundamentals)
- **F&E Training (Felix) free resources:** paper LBO, statement linking, spring-week careers guide, REIT summary. — [F&E paper LBO](https://www.fe.training/free-resources/private-equity/paper-lbo/); [F&E spring weeks](https://www.fe.training/free-resources/careers-in-finance/investment-banking-careers-spring-week-internships)

**Paid courses and reputation**
- **Wall Street Oasis forum views:** "BIWS is much more analogous to questions you'll get in interviews than WSP"; "BIWS goes further in depth"; "if you want to learn how to model, understand the M&A process, LBO process… definitely use WSP"; and the consensus that certificates are mainly for knowledge rather than for the CV. — [Wall Street Oasis forum](https://www.wallstreetoasis.com/forum/investment-banking/wsp-vs-wall-street-training-vs-biws-vs-nyif-investment-banking)
- **BIWS (sister site Mergers & Inquisitions):**
  - Positions itself for IB, PE and HF candidates, and as strong on case studies and modelling tests.
  - Has a 90-day refund policy.
  - Self-reports 120,000+ users in 114+ countries.
  - Its comparison pages admit they are not neutral.
  - — [BIWS vs WSP](https://breakingintowallstreet.com/biws-vs-wall-street-prep-comparison); [BIWS vs CFI](https://breakingintowallstreet.com/biws-vs-cfi); [M&I BIWS page](https://mergersandinquisitions.com/breaking-into-wall-street-biws)
- **WSP:**
  - Claims to have pioneered self-study IB training.
  - Its comparison cites a premium package at $499 with lifetime access, versus $497 a year for CFI's FMVA subscription. These are vendor-stated figures of uncertain date.
  - A third-party review highlights lifetime access.
  - — [WSP vs CFI](https://www.wallstreetprep.com/knowledge/wall-street-prep-vs-corporate-finance-institute/); [Benzinga WSP review](https://benzinga.com/money/wall-street-prep-review)
- **CFI FMVA:**
  - 15 required courses, 3 electives, optional case studies and a final exam, taking about 100–120 hours.
  - Aimed at aspiring and early-career professionals.
  - WSP, a competitor, argues employers do not hold FMVA in high regard.
  - — [CFI vs BIWS](https://corporatefinanceinstitute.com/resources/career/cfi-vs-breaking-into-wall-street/); [CFI vs WSP](https://corporatefinanceinstitute.com/resources/career/cfi-vs-wall-street-prep/); [WSP vs CFI](https://www.wallstreetprep.com/knowledge/wall-street-prep-vs-corporate-finance-institute/)
- **Training The Street (TTS):**
  - Founded 1999 and serves corporate and educational clients.
  - Courses run as live, virtual or in-person programmes, often 1–2 weeks condensed, and target analysts, associates and interns.
  - Third-party profiles place it in bank onboarding (Goldman Sachs, Morgan Stanley, J.P. Morgan, BofA, Citi, Evercore); this is a secondary claim.
  - — [TTS about](https://trainingthestreet.com/about/); [TTS public courses](https://trainingthestreet.com/public-courses); [Altss profile](https://altss.com/profile/training-the-street); [UNC](https://careerandleadership.unc.edu/vendor-resources/training-the-street/)
- **CFA Level I/II (FRA and Corporate Issuers) notes** are a rigorous free or low-cost backbone for accounting and M&A theory, for example AnalystPrep's notes on SOTP, REIT valuation and M&A payment method. — [AnalystPrep SOTP](https://analystprep.com/study-notes/cfa-level-2/sum-of-parts-valuation/); [AnalystPrep M&A payment](https://analystprep.com/study-notes/cfa-level-2/effects-of-price-and-payment-method/)

### Inferences
- **Suggested curriculum sequence (synthesis, roughly 10–14 weeks part-time to internship-ready):**
  1. *Weeks 1–3, accounting:* the three statements and their links; the 10+ walk-throughs in Section 1, including IFRS 16 and IFRS 18. Free: WSP/CFI/F&E articles. Book: R&P chapter on financial statements analysis inside comps.
  2. *Weeks 4–5, EV and multiples:* the bridge, TSM, multiple pairing, IFRS 16 consistency. Practise the £765m bridge.
  3. *Weeks 6–8, valuation:* comps and precedents (R&P chapters 1–2), then DCF (R&P chapter 3 plus Damodaran's free sessions on cost of capital and beta). Rebuild the £ DCF above with sensitivities.
  4. *Weeks 9–10, M&A:* merger model, accretion/dilution, PPA and goodwill, S&U (R&P M&A chapters; BIWS/WSP merger-model modules).
  5. *Weeks 11–12, LBO:* paper LBOs until each takes under 10 minutes, then a 60–90-minute LBO test (WSP/F&E practice tests).
  6. *Weeks 13–14:* capital markets basics (Section 7), sector multiples, mock interviews using the 50-question bank, and current deals and markets.
  7. *Beyond (analyst-ready):* full 3-statement model with debt schedule and circularity; Macabacus and pitchbook formatting; FIG/real estate specialisms as needed.
- **Worth paying for:**
  - At most one interview/modelling course, if the free material plus R&P is not enough.
  - Community sentiment favours BIWS for interview depth and WSP for modelling.
  - The FMVA is best treated as structured learning rather than a CV credential.
  - TTS is mainly encountered as bank-provided training, not something students typically need to buy.
  - Prices change often; verify them before purchase.
- **UK caveat:** all the major paid courses are US-centric (US GAAP, $). UK candidates should add IFRS 16 and IFRS 18, UK tax (25%), gilts, the Takeover Code and UK ECM (ITF, ABB, PEG) from UK sources.

### Gaps
- Independent, non-vendor reviews (e.g., Reddit r/FinancialCareers or r/investmentbanking threads, or recent WSO polls) were not retrieved, so the reputation evidence is thin: one WSO thread plus vendor pages.
- Current (2026) prices for BIWS, WSP, CFI and TTS were not verified.
- Nothing was found on UK-specific prep providers' reputation, such as Bright Network or Intervyo-type platforms, beyond their own pages.
- Could not confirm whether Rosenbaum & Pearl has released a 4th edition, or the current BIWS "400 Questions" edition and price.
