import base64
import os

from flask import Flask, jsonify, request, send_from_directory

from floorplan import pipeline

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(BASE_DIR, "..", "furniture-planner", "dist")
MODELS_DIR = os.path.join(BASE_DIR, "..", "furniture-planner", "models")

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIST, "index.html")


@app.route("/models/<path:filename>")
def models(filename):
    return send_from_directory(MODELS_DIR, filename)


@app.route("/api/floorplan", methods=["POST"])
def floorplan():
    """Upload a floor-plan image, get back a Building JSON + debug overlay."""
    data = request.get_json(silent=True) or {}
    payload = data.get("image")
    if not payload:
        return jsonify({"error": "Missing image"}), 400
    mpp = data.get("meters_per_pixel")
    try:
        model, debug_png, info = pipeline.process_image(payload, mpp)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - defensive
        return jsonify({"error": f"Processing failed: {exc}"}), 500
    return jsonify({
        "model": model,
        "debug": "data:image/png;base64," + base64.b64encode(debug_png).decode(),
        "info": info,
    })


@app.route("/<path:filename>")
def static_files(filename):
    if filename.startswith("models/"):
        return send_from_directory(MODELS_DIR, filename[len("models/"):])
    return send_from_directory(FRONTEND_DIST, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
