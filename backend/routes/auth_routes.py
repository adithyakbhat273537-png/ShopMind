
from flask import Blueprint, request, jsonify
from models.user_model import register_user, login_user

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json()

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return jsonify({
            "message": "All fields are required"
        }), 400

    if len(password) < 8:
        return jsonify({
            "message": "Password must contain at least 8 characters"
        }), 400

    try:
        register_user(name, email, password)

        return jsonify({
            "message": "Registration successful"
        }), 201

    except Exception as error:
        if "1062" in str(error):
            return jsonify({
                "message": "Email already registered"
            }), 409

        return jsonify({
            "message": "Registration failed"
        }), 500


@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({
            "message": "Email and password are required"
        }), 400

    user = login_user(email, password)

    if user:
        return jsonify({
            "message": "Login successful",
            "user": {
                "user_id": user["user_id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"]
            }
        }), 200

    return jsonify({
        "message": "Invalid email or password"
    }), 401
