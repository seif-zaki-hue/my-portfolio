# BMI Calculator - the web version of my Tkinter project.
# This file runs as real Python inside the browser (PyScript).
# Tkinter can't run on a web page, so the widgets are in bmi.html
# and everything that happens (calculate, clear, results) is written here in Python.

from pyscript import document, when


# ---------- logic (same rules as the Tkinter version) ----------
def classify(bmi):
    """Return (message, colour) for a BMI value."""
    if bmi < 16:
        return "You are seriously underweight", "#60a5fa"
    elif bmi < 18.5:
        return "You are underweight", "#38bdf8"
    elif bmi < 25:
        return "You are normal", "#22c55e"
    elif bmi < 30:
        return "You are overweight", "#facc15"
    elif bmi < 35:
        return "You are obese", "#fb923c"
    else:
        return "You are severely obese", "#ef4444"


def calculate_bmi(weight, height):
    if height > 3:            # the user typed centimetres, e.g. 175
        height = height / 100
    return weight / (height * height)


def gauge_position(bmi):
    """Where the marker sits on the colour bar (BMI 10 -> 0%, BMI 40 -> 100%)."""
    return max(0, min(100, (bmi - 10) / 30 * 100))


# ---------- page elements ----------
weight_in = document.querySelector("#weight")
height_in = document.querySelector("#height")
calc_btn = document.querySelector("#calc")
result = document.querySelector("#result")
value = document.querySelector("#bmi-value")
gauge = document.querySelector("#gauge")
marker = document.querySelector("#marker")
loading = document.querySelector("#loading")


def show_error(text):
    result.textContent = text
    result.style.color = "#f87171"
    value.textContent = ""
    gauge.style.display = "none"


# ---------- buttons ----------
@when("click", "#calc")
def on_calculate(event):
    try:
        w = float(weight_in.value)
        h = float(height_in.value)
    except ValueError:
        show_error("Please enter numbers only")
        return

    if w <= 0 or h <= 0:
        show_error("Weight and height must be bigger than 0")
        return

    bmi = calculate_bmi(w, h)
    message, colour = classify(bmi)

    value.textContent = f"BMI {bmi:.1f}"
    value.style.color = colour
    result.textContent = message
    result.style.color = colour
    marker.style.left = f"{gauge_position(bmi)}%"
    gauge.style.display = "block"


@when("click", "#clear")
def on_clear(event):
    weight_in.value = ""
    height_in.value = ""
    result.textContent = ""
    value.textContent = ""
    gauge.style.display = "none"
    weight_in.focus()


@when("keydown", "input")
def on_key(event):
    if event.key == "Enter":
        on_calculate(event)


# Python is ready: enable the button and hide the loading text
calc_btn.disabled = False
loading.style.display = "none"
