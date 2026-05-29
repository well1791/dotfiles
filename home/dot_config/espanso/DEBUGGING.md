# Espanso vim-digraphs Debugging Session

## Problem
vim-digraphs package installed but special Unicode characters (α, à, Ω) weren't working.

## Debugging Steps We Followed

### 1. **Gather Information**
```bash
espanso package list          # Confirm package installed
espanso status                # Check if running
espanso log                   # View real-time errors
```

**Key discovery:** Error messages showed `missing vkey mapping for char 'α'`

### 2. **Examine Configuration**
```bash
cat ~/.config/espanso/config/default.yml
```

**Found two issues:**
- `backend: inject` - Can't type Unicode characters on Wayland
- `word_separators: [","]` - Breaks vim-digraphs triggers like `,SP`

### 3. **Read Package Documentation**
```bash
cat ~/.config/espanso/match/packages/vim-digraphs/README.md
```

**Learned:** vim-digraphs uses 3-char pattern: `,` + letter + modifier

### 4. **Test Systematically**
- **Test 1:** Simple chars (`,Nb` → #) ✅ Worked
- **Test 2:** Unicode chars (`,a*` → α) ❌ Failed

This isolated the problem to Unicode character injection.

### 5. **Understand Root Cause**

**Why inject backend fails:**
- Wayland's inject backend simulates physical keypresses
- US keyboard layout only has keys for ASCII characters
- Unicode chars like α have no key combination to simulate
- Result: `missing vkey mapping` error

**Why clipboard backend works:**
- Doesn't simulate keypresses
- Directly pastes Unicode text via clipboard
- Trade-off: Briefly uses clipboard (visible in Klipper history)

## Solutions Applied

### Fix #1: Removed comma from word_separators
```yaml
word_separators:
  - " "
  # - ","  # Disabled for vim-digraphs compatibility
  - "."
  - "!"
  - "?"
```

### Fix #2: Switched to clipboard backend
```yaml
backend: clipboard  # For Unicode character support
```

## Trade-offs Accepted

✅ **All vim-digraphs work** (including Unicode)
❌ **Klipper shows single characters** (acceptable bloat)

## Future Improvements

- Consider switching to CopyQ clipboard manager (better filtering)
- Explore if future espanso versions support primary selection
- Monitor Wayland vkey mapping improvements

## Key Debugging Lessons

1. **Check logs first** - They show the actual errors
2. **Test systematically** - Isolate simple vs complex cases
3. **Understand backends** - Different backends have different capabilities
4. **Read documentation** - Package READMEs explain trigger patterns
5. **Accept trade-offs** - Perfect solutions don't always exist

## Verification Commands

```bash
# Check if espanso is running and which backend
espanso status
espanso log | grep -i clipboard

# Test vim-digraphs
# Simple: ,Nb → #
# Unicode: ,a* → α

# Monitor errors in real-time
espanso log
```

## Config Location

`~/.config/espanso/config/default.yml`
