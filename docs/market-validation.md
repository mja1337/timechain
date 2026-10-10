# Market validation before merging

The market has a two-step money flow: the player first opens a locked quote, then confirms it. A button can look enabled while the review render is broken, so both stages must be tested.

## Automated checks

Run these from the repository root before opening or approving a PR:

```bash
node scripts/check-project-structure.mjs
node scripts/check-ui-contracts.mjs
node scripts/check-historical-data.mjs
node scripts/check-engine-behaviour.mjs
```

The checks cover script parsing, the exchange ticket contract, quote validation, order-book impact, settlement conversion, and the underlying engine rules. `check-ui-contracts.mjs` also guards the transaction-review wrapper so a copy-only change cannot reintroduce the recursive `transactionImpact()` failure.

## Manual browser flow

Use a local server with no-store responses, for example:

```bash
python3 scripts/dev-server.py 8091
```

Open the game, load a run with a market and a non-zero venue balance, then run this sequence:

1. Open **Treasury → Market**.
2. Select a venue with BTC deposited.
3. Confirm the venue balance, exact BTC amount, bid price and **Sell** button are visible.
4. Click **Sell**.
5. Confirm a review modal appears containing:
   - what leaves;
   - what cash arrives;
   - fees and market impact;
   - the position afterward;
   - **Cancel** and **Confirm sell**.
6. Cancel and verify every balance is unchanged.
7. Open the review again and confirm the sale.
8. Verify venue BTC decreases, liquid cash increases, the activity ledger records the sale, and a pending bill reflects the new cash.
9. Repeat with **Deposit all hot BTC · sell here** and verify the combined quote and final cash result.
10. Change the exact BTC amount, then verify the button label and review quote use the new amount.
11. Test a frozen venue: selling must be blocked with an explanation and no balance change.
12. Reopen the same route from a fresh page load and confirm there are no browser console errors.

## Regression evidence to record in the PR

Include the four command results, the tested date/seed or save description, and a short note covering both cancel and confirm. If the browser console reports an error, treat the market flow as failed even if the controls remain visible.

## Mutation check for this incident

For changes touching transaction reviews, temporarily replace the base impact function with a wrapper that calls itself. The UI contract suite must fail before the mutation is removed. For copy changes in a template, run the structure or historical-data check; both parse every shipped application script and catch an unmatched or duplicated template branch.
