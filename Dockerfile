FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (libgomp for onnxruntime, tesseract for OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    tesseract-ocr \
    tesseract-ocr-ind \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from backend folder
COPY backend/requirements.txt ./requirements.txt

# Install python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the entire backend directory into container
COPY backend/ ./

# Copy python runner script
COPY run.py ./run.py

# Configure environment
ENV PORT=8000
ENV TESSERACT_CMD=/usr/bin/tesseract
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Start FastAPI server via robust Python runner
CMD ["python", "run.py"]
