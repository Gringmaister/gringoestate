# Playbook · Deploy Verification

## Goal
Know whether a change is truly live.

## Sequence
1. confirm local diff/commit/push
2. fetch public page and look for a unique new string
3. hit function endpoints directly
4. separate HTML success from function success
5. only then declare the deploy done

## Minimum checks
- page contains the new layout/copy
- `wispy-panel-data` returns OK
- `wispy-panel-chat` returns OK or valid fallback
- no critical dashboard block remains in permanent loading/error state
