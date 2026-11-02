# Local speech synthesis

The expressive Mandarin voice uses [Chatterbox](https://github.com/resemble-ai/chatterbox)
and the [ONNX conversion](https://huggingface.co/onnx-community/chatterbox-multilingual-ONNX)
(MIT), pinned to revision `452d3f434aa592098f1eedac9099f33642ab2da5`.
`backend/app/services/expressive_tts.py` adapts the conversion's inference example.
Copyright (c) 2025 Resemble AI. The MIT permission and warranty terms reproduced
below also apply to this adaptation. Model files are installed separately.

The fixed Mandarin reference recording is `asset/zero_shot_prompt.wav` from
[CosyVoice](https://github.com/QwenAudio/CosyVoice), distributed under Apache-2.0,
pinned to commit `b02d7e61f743839a93d4058d9c11e79f82fad041`.
Its SHA-256 is `c7b31d6dbe7cc6a716dded00550db5b50940bf209e424e4ad207b12e657c8ff6`.
No user recording is required or uploaded. The installer verifies the four
external ONNX weight files and this reference recording against fixed SHA-256s.

Knowra uses [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0)
and the [Kokoro-82M-v1.1-zh model](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)
(Apache-2.0). The setup script installs the official sherpa-onnx int8 conversion
locally and retains its LICENSE and README. The pinned archive SHA-256 is
259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c.
The bundle also includes [eSpeak NG](https://github.com/espeak-ng/espeak-ng)
pronunciation data; see its GPL-3.0 license and upstream notices.
Model weights are downloaded separately, not embedded in the frontend bundle.

# EasyUI Calendar and Date Picker

`src/components/ui/calendar.jsx` and `src/components/ui/date-picker.jsx` adapt
the single-date calendar, directional month transitions, gliding selection pill
and spring popover from [EasyUI](https://www.easyui.site/components/date-picker).
The adaptation uses Knowra's theme, Chinese labels, Monday-first weeks, reduced
motion, local date strings, and Radix popover positioning and focus management.

Upstream: https://github.com/Surajmaurya1/easyui

Source: https://www.easyui.site/source/calendar.json and
https://www.easyui.site/source/date-picker.json

MIT License

Copyright (c) 2026 Suraj Maurya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Authentication experience

The authentication page reuses Knowra's MIT-adapted EasyUI SpotlightCard surface
and shared spring transitions. Its login/register switch follows EasyUI's
animated-tabs gliding indicator pattern. The continuous course storyboard and
watercolor composition are implemented locally with React and Motion.

References: https://www.easyui.site/components/spotlight-card and
https://www.easyui.site/components/animated-tabs
