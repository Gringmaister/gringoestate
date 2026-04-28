# Playbook · Netlify Function Debug

## Goal
Go from broken endpoint to reliable production response fast.

## Sequence
1. hit the function URL directly
2. capture status + exact error body
3. identify whether failure is method, env, path, model, or parsing
4. patch the smallest root cause
5. retest the function directly
6. retest the page block that depends on it

## Known patterns in this project
- reading workspace files that do not exist in Netlify
- writing outside `/tmp`
- invalid Gemini model ids
- HTML updated before functions propagated

## Done standard
- endpoint returns OK
- UI block no longer hangs/crashes
