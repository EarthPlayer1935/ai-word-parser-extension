from fastapi import FastAPI
from dotenv import load_dotenv
from routers import analyze, wordbook, user, pdf

load_dotenv()

app = FastAPI(title="Word Root Parser Backend")

# Include Routers
app.include_router(analyze.router)
app.include_router(wordbook.router)
app.include_router(user.router)
app.include_router(pdf.router)

@app.get("/")
def read_root():
    return {"message": "Word Root Parser Backend is running!"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
