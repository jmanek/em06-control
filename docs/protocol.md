# Extracted EM06 mouse protocol

Source: the public Hub bundle at `https://hub.protoarc.com/assets/index-B-NBYECN.js`.

## HID framing

- WebHID report ID: `8`
- Payload length: 16 bytes
- Command byte: byte `0`
- Flash address: bytes `2..3`, big-endian
- Payload length: byte `4` (mouse path has no extra type offset)
- Payload: bytes `5..`
- Frame checksum: `(0x55 - sum(bytes 0..14) - 8) & 0xff` in byte `15`

The source initializes byte 15 to `0xef`, but overwrites it with the adjusted
checksum before every send. The `0xef` value is not transmitted.

## Commands

| Command | Meaning |
|---:|---|
| `0x01` | Device identification / encryption data |
| `0x03` | Device online |
| `0x07` | Write flash |
| `0x08` | Read flash |
| `0x0e` | Get current profile |
| `0x0f` | Set current profile |
| `0x12` | Read device firmware version |

The Hub's `ReadVersionID` command returns the device version in response bytes
`5..6`, displayed as `v<major>.<minor in hexadecimal>` (for example, `v1.0a`).
The app reads and displays that value but does not claim update availability or
perform firmware writes; ProtoArc Hub remains the update authority.

## Mouse flash layout

- Key records: offset `96`, four bytes per slot. The EM06 Hub uses sparse physical
  slots `0, 1, 2, 4, 3, 5, 11, 8` for its eight displayed controls; slot `5`
  is the side DPI control, slot `8` is the top-right Drag Scroll control, and
  slot `11` is the extra programmable control.
- Shortcut records: offset `256`, 32 bytes per slot; the shortcut slot is the
  same sparse physical slot as its key record
- Macro records: offset `768`, 384 bytes per slot
- EEPROM end: `6987`

Key record encoding is `[type, parameter >> 8, parameter & 255, checksum]`,
where the local checksum is `0x55 - sum(first three bytes)`. The Hub defines
function type `9` as `ProfileSwitch`. On tested firmware v4.10, this action
advances to the next profile rather than selecting the stored parameter.
The editor therefore labels it **Next profile** and offers no target selector.
Existing raw parameters are preserved when reading, importing, exporting, and
writing a profile. The cycle helper retains its existing `1`, `2`, `3`, `0`
parameter sequence for compatibility; those values do not establish direct
selection support.
The extra Button 7 is displayed at index 6 and stored at raw slot 11.

### Profile-switch verification

For [issue #1](https://github.com/jmanek/em06-control/issues/1), three mappings
were written to Button 7 on Profile 3 and read back before a single physical
press: `09 00 00 4c`, `09 01 00 4b`, and `09 00 01 4b`. Each press selected
Profile 4. These tests distinguish cycling from the usual low-byte, high-byte,
and one-based target interpretations. Original bytes and the active profile
were restored and verified afterward.

The app's complete write frames were also compared with the public Hub's key
writer and matched byte for byte. This supports firmware cycling behavior for
the tested encodings; it does not rule out an undocumented alternative.
The sidebar's direct selection uses the separate `0x0f` host command, not a
type-9 key record.

The Hub writes flash in chunks of at most 10 bytes and waits for the matching
input report before sending the next chunk. The simulator and WebHID transport
follow that sequencing boundary.

Shortcut records begin with `keyCount * 2`, followed by each HID key as
`[type | 0x80, valueLo, valueHi]`, then the same keys in reverse order with
`type | 0x40`, and a final local checksum. The editor decodes these records,
labels known Hub combinations such as Copy, and can record arbitrary keyboard
combinations. Macro slots are identified from their 31-byte UTF-8 name records;
macro event authoring is intentionally not exposed until the event-table format
has been validated against the Hub implementation.
