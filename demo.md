1. 0805108010|CIDAU - sweet oranges (Citrus sinensis)

- HMI + GMS, validity 2 months, no varieties.
- The point: This is one of only ~409 species rows out of ~486,000 production pairs that triggers the GMS-declaration page. It's the only combination that does. Compare with the apples example:
  apples carry marketing data (JOINT+SMS) but do not trigger GMS, because the predicate is HMI AND GMS. Oranges trigger it; apples don't. Same explorer, opposite page visibility.

2. 0808108090|MABSS - other Malus species

- Same commodity as your apples example (0808108090), JOINT+SMS, but only 2 varieties.
- The point: Two species under the same commodity code, with different species-level data. MABSD has 67 varieties; MABSS has 2. Shows that the journey adapter models species-level variance and
  that two notifications can pick the same commodity code yet exercise very different obligations.

3. 0805102810|CIDSI - lemons

- HMI + SMS, validity 7 months, 40 varieties + 3 classes.
- The point: HMI authority but the marketing standard is SMS, not GMS. The GMS-declaration page does not fire here. Contrast directly with #1: same regulatory_authority, different
  marketing_standard. Demonstrates that just being HMI isn't enough - the AND in the predicate is load-bearing.

4. 0709999090|DATME - a JOINT+GMS vegetable

- JOINT + GMS, validity 2 months.
- The point: Mirror image of #3. Has GMS marketing standard but JOINT authority, so the GMS page still doesn't fire. #3 fails the predicate on the marketing-standard arm; #4 fails it on the
  regulatory-authority arm. Together they triangulate why both halves of the AND matter.

5. 06011020 - bulbs for planting (PHSI-only commodity)

- No species rows. Commodity-level: group: 'Plants for Planting', propagation: 'bulb', requires_finished_or_propagated: true.
- The point: Three demonstrations in one example. (a) No species rows means PHSI-only by absence - the resolver reads the empty species lookup as "no marketing implications." (b) The propagation
  attribute drives the intended-use sub-journey (bulb vs plant). (c) The requires_finished_or_propagated flag drives a dropdown on the bulk-details page. All three pieces of variance come from
  commodity-level config, not species-level.

6. 10011100 - wheat seed for sowing (the boring default)

- No species rows. Commodity-level: group: 'Seed & Tissue Culture', all flags false, no propagation.
- The point: This is what the dominant 98.9% of plant imports actually look like. No GMS page, no variety/class selection, no intended-use sub-journey, no bulk-details fields. Just commodity code
+ species name (PHSI-only). Demonstrates that the rare-interesting cases (#1-#5) are not the common path. The journey configuration handles both ends of the spectrum without special-casing.

Demo narrative if you want to stack them in order:

1. Start with #6 (wheat) - the simplest case. "This is most of CHEDPP."
2. Then #5 (bulbs) - "When commodity-level config kicks in, this is what happens."
3. Then your MABSD (apples) - "Now we get into species-level data. Look at all those varieties."
4. Then #2 (MABSS) - "And here's a different species under the same commodity. Different data, same explorer."
5. Then #1 (oranges) - "This is the one notification shape that fires the GMS-declaration page."
6. Close with #3 and #4 (lemons + the JOINT+GMS veg) - "And here's why both halves of the predicate matter. Same data shape, predicate disagrees, GMS page doesn't fire."

That sequence walks the audience from "boring default" → "commodity-level variance" → "species-level data depth" → "intra-commodity variance" → "the GMS trigger" → "why the predicate's AND
matters" - which mirrors the structure of the SOLUTION doc.



07099910%7CERXPG
