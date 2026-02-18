@echo off
echo Setting up Python virtual environment...
python -m venv venv
call venv\Scripts\activate.bat
echo Installing dependencies...
pip install -r requirements.txt
echo Setup complete!
echo To run the server: venv\Scripts\uvicorn main:app --reload
pause
