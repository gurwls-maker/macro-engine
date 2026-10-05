---
name: macro-engine-product-review
description: Inspect a Macro Engine change against actual behavior, scientific evidence, and user needs.
---

1. State the user's problem in plain Korean; inspect the current code and relevant data shape.
2. Read `README.md` and `docs/evidence.md` for current behavior. Treat both as falsifiable, not permission gates.
3. Prefer the smallest complete behavior change. Consider missing/invalid input, conflicting contexts, completed snapshots, persistence failures, accessibility, and narrow screens.
4. For numeric changes, separate evidence from chosen coefficients and test continuity, monotonicity, and boundaries. A passing test does not establish physiological validity.
5. Implement, verify, and report the practical result and limitations. Do not make new meta-work or ask users to choose scientific coefficients.
