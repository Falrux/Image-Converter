# hello fr

import os
import uuid
import requests
import zipfile
import io
from flask import Flask, request, jsonify, send_from_directory, render_template, send_file
from flask_cors import CORS
from PIL import Image
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder='../webpage')
CORS(app)

class Config:


    # I did this because the server is hosted with vercel
    INPUT = "/tmp/input"
    OUTPUT = "/tmp/output"
    STATIC = "/tmp/static"
    
    os.makedirs(INPUT, exist_ok=True)
    os.makedirs(OUTPUT, exist_ok=True)
    os.makedirs(STATIC, exist_ok=True)
    
    ALLOWED_FORMATS = ['png', 'jpeg', 'jpg', 'webp'] # TODO: Add more image formats later
    
    MAX_FILE_SIZE = 250 * 1024 * 1024 # 250MB



def download_image(url, dest):
    try:
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            with open(dest, 'wb') as f:
                f.write(r.content)
            return True, ""
        else:
            return False, f"HTTP {r.status_code}"
    except Exception as e:
        return False, f"Download failed: {e}"



@app.route('/')
def index():
    return render_template('index.html')


@app.route('/styles.css')
def serve_css():
    return send_from_directory('../webpage', 'styles.css')


@app.route('/script.js')
def serve_js():
    return send_from_directory('../webpage', 'script.js')



@app.route('/convert_image', methods=['POST'])
def convert_image():
    try:
        target_format = request.form.get('format', 'png').lower()
        if target_format not in Config.ALLOWED_FORMATS:
            return jsonify({"status": "error", "message": "Unsupported format"}), 400

        if 'image_url' in request.form:
            image_url = request.form['image_url']
            
            input_path = os.path.join(Config.INPUT, f"input_{uuid.uuid4().hex}.tmp")
            success, error = download_image(image_url, input_path)
            if not success:
                return jsonify({"status": "error", "message": f"Download failed: {error}"}), 400
        
        elif 'image' in request.files:
            file = request.files['image']
            if file.filename == '':
                return jsonify({"status": "error", "message": "No file selected"}), 400
            
            file.seek(0, os.SEEK_END)
            file_size = file.tell()
            file.seek(0)
            
            if file_size > Config.MAX_FILE_SIZE:
                return jsonify({"status": "error", "message": "File too large (max 250MB)"}), 400
            
            filename = secure_filename(file.filename)
            input_path = os.path.join(Config.INPUT, f"input_{uuid.uuid4().hex}.tmp")
            file.save(input_path)
        else:
            return jsonify({"status": "error", "message": "No image provided"}), 400

        try:
            with Image.open(input_path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                if target_format in ['jpeg', 'jpg'] and img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                
                output_filename = f"converted_{uuid.uuid4().hex}.{target_format}"
                output_path = os.path.join(Config.OUTPUT, output_filename)
                
                save_kwargs = {}
                if target_format in ['jpeg', 'jpg']:
                    save_kwargs['quality'] = 85
                elif target_format == 'webp':
                    save_kwargs['quality'] = 85
                    save_kwargs['method'] = 6
                
                img.save(output_path, format=target_format.upper(), **save_kwargs)
                
                static_path = os.path.join(Config.STATIC, output_filename)
                img.save(static_path, format=target_format.upper(), **save_kwargs)
                
        except Exception as e:
            return jsonify({"status": "error", "message": f"Image conversion failed: {str(e)}"}), 500
        
        finally:
            if os.path.exists(input_path):
                os.remove(input_path)
        
        converted_url = f"/static/{output_filename}"
        download_url = f"/download/{output_filename}"
        
        return jsonify({
            "status": "success",
            "converted_url": converted_url,
            "download_url": download_url,
            "format": target_format
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": f"Server error: {str(e)}"}), 500


@app.route('/static/<filename>')
def serve_static(filename):
    return send_from_directory(Config.STATIC, filename)


@app.route('/download_all', methods=['POST'])
def download_all():
    try:
        data = request.get_json()
        filenames = data.get('filenames', [])
        
        if not filenames:
            return jsonify({"status": "error", "message": "No files provided"}), 400
        
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for filename in filenames:
                file_path = os.path.join(Config.STATIC, filename)
                if os.path.exists(file_path):
                    zip_file.write(file_path, filename)
        
        zip_buffer.seek(0)
        
        return send_file(
            io.BytesIO(zip_buffer.read()),
            mimetype='application/zip',
            as_attachment=True,
            download_name='converted_images.zip'
        )
        
    except Exception as e:
        return jsonify({"status": "error", "message": f"Error creating zip: {str(e)}"}), 500


@app.route('/download/<filename>')
def download_file(filename):
    file_path = os.path.join(Config.STATIC, filename)
    if not os.path.exists(file_path):
        return jsonify({"status": "error", "message": "File not found"}), 404
    
    return send_from_directory(Config.STATIC, filename, as_attachment=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0") in ["1", "true", "yes"]
    app.run(host="0.0.0.0", port=port, debug=debug)