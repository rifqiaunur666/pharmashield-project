FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (libgomp for onnxruntime, libgl1/libglib for opencv, tesseract for OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    tesseract-ocr-ind \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from backend folder
COPY requirements.txt ./requirements.txt

# Install python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY . ./

# Configure environment
ENV PORT=8080
ENV TESSERACT_CMD=/usr/bin/tesseract
ENV PYTHONUNBUFFERED=1

EXPOSE 8080
EXPOSE 8000

# Start FastAPI server via robust Python runner
CMD ["python", "run.py"]
