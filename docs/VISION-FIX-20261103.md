# Antigravity image-input error handling

Base: BotAILearning/qibox v0.11.10-candidate.001 at 843fd53fd6cdf69bd162838bf2c23b3d25978628. The upstream main branch was 221 commits behind this published candidate when checked.

An image request returning HTTP 400, 415, or 422 does not by itself establish that the model lacks vision. Invalid image bytes, context overflow, and an unsupported max_tokens parameter can produce the same statuses. Previously, all these cases entered the unsupported-image path. In mixed requests that path removed the image and recursively retried as text, hiding the original failure; required-image requests were incorrectly reported as unsupported vision.

The change reads the error body for HTTP 415 as well, reserves the existing text fallback for explicit image-capability rejection, and preserves image bytes when taking the already-existing budget-parameter retry. Other image request failures surface a distinct error, and context overflow retains its real cause. No model request or retry step is added. Required-image calls do not gain a budget retry.

Regression coverage: 12 tests in test/ai-vision-errors.test.mjs cover malformed pictures, HTTP 415, context overflow, token-budget rejection, request counts, and the existing OpenAI/Anthropic unsupported-image behavior. Pure-image requests do not gain the retry reserved for requests that already had a mixed-text fallback. Report and cumulative output ceilings remain enforced.

On a separately maintained fnOS 0.9.70 installation, the newer account/contact/message-bound MessageResourceInfo mapping in wechat-images.py and wechat-data.py was backported. That file lookup fix is already present in this upstream revision, so it is not duplicated here. Thumbnail provenance is preserved in the installed backport.

A synthetic PNG with unmentioned characters was read correctly both through CPA directly and through Qibox's actual AIProvider request builder using gemini-3.8-flash-high. This verifies vision and serialization for that test image. It does not establish that every WeChat image format is readable, nor substitute for testing a specific failing conversation. No message was sent to a WeChat contact for this verification.
