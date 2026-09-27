# Tilde — Reading List

Prior work behind the design questions in `LANGUAGE_DESIGN.md`. Not user-facing.
Each entry says what it is for, so it can be read for that and no further.

## Possible values — every name as a set

The problem: a name stands for a set of possible values, and those sets must not
be stored per field (`p.x`, `p.y`) or per element, since both lose which values
go together. See "Possible values" in `LANGUAGE_DESIGN.md`.

### Reading order

1. **The Curry report** — curry-lang.org. Only the parts on free variables,
   non-determinism and **call-time choice**. Call-time choice is the rule that
   `p.x` and `p.y` are two reads of *one* choice of `p`, which is the whole
   correlation problem stated as semantics.
2. **Antoy & Hanus, "Set Functions for Functional Logic Programming"** (PPDP
   2009). Collecting every value of an expression into one set — what
   `print p` showing the whole set is. The care they take over choices made
   *inside* versus choices *passed in* is what matters once `print` sits inside a
   definition.
3. **Hanus, "Multi-paradigm Declarative Languages"** (ICLP 2007). How narrowing
   and **residuation** fit together. Residuation — suspend arithmetic on an
   unknown number until it is known — is where `k + 1` stands today; constraint
   solving is the way past it.
4. **Jaffar & Lassez, "Constraint Logic Programming"** (POPL 1987), and CLP(R).
   An answer is a substitution *plus leftover constraints*, and a program means
   the set of its answers. This is the model for a branch: values for what is
   determined, a locus for what is not.
5. **The Verse Calculus** (Augustsson, Peyton Jones et al., ICFP 2023). The
   closest living language: `=` only narrows, failure is the empty set, a
   single value is the trivial case of many. Read for how a one-value program
   stays simple.

### When the need arrives

- **Abstract interpretation domains** — Miné, "The Octagon Abstract Domain"
  (2006). For the vocabulary: a *non-relational* domain (one set per variable)
  loses correlation, a *relational* one keeps it.
- **Interval constraint propagation** — Jaulin, Kieffer, Didrit & Walter,
  *Applied Interval Analysis* (2001); SIVIA and set inversion; the ibex library.
  For inequalities and regions: solution sets as unions of boxes, correlation
  recovered by splitting. Watch for the dependency problem (`k - k` over `[0,1]`
  gives `[-1,1]`).
- **Fudos & Hoffmann, "A Graph-Constructive Approach to Solving Systems of
  Geometric Constraints"** (ACM TOG 1997). Splitting a figure into independently
  solvable clusters (which keeps branches from multiplying), and the **root
  identification problem** — choosing among 2ⁿ configurations, which is `pick`.
- **Kortenkamp, *Foundations of Dynamic Geometry*** (thesis, 1999), and
  Cinderella. When a figure is edited, which of two intersections is still "the
  same `p`". Needed once the playground moves things.

### Reference only — the exact answer

- **Collins, cylindrical algebraic decomposition** (1975). Represents any set
  cut out by polynomial equations and inequalities exactly, as cells, using a
  product only where one is true. Doubly exponential; the yardstick, not the
  plan.
- **Wu's method / triangular sets.** Splits a solution set into components; built
  for geometry theorem proving.
- **Sommese & Wampler, *The Numerical Solution of Systems of Polynomials*
  (2005)**; HomotopyContinuation.jl. Every isolated solution, plus *witness sets*
  for curves and surfaces of solutions — "p anywhere on c".
