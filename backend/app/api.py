from fastapi import FastAPI, File, UploadFile
from tempfile import NamedTemporaryFile
from fastapi.middleware.cors import CORSMiddleware
from .loopFinder import loopFinder
from moviepy.editor import VideoFileClip
import os

app = FastAPI()

origins = [
    "http://localhost:3000",
    "localhost:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/", tags=["root"])
async def read_root() -> dict:
    return {"message": "Welcome to your todo list."}

'''
@app.post("/uploadfile")
async def create_upload_file(file: UploadFile):
    temp = NamedTemporaryFile(delete=False)
    try:
        try:
            data = await file.read()
            with temp as f:
                f.write(data)
        except Exception:
            return {"message": "There was an error uploading the file"}
        finally:
            file.close()
        
        video = VideoFileClip(file.file.name)
        lf = loopFinder(video)
        gifs = lf.process_clip()
    except Exception as error:
        print(error)
        return {"message": "There was an error processing the file"}
    finally:
        os.remove(temp.name)
    return {"gifs": gifs}
'''
@app.post("/uploadfile")
async def create_upload_file(file: UploadFile):
    temp = NamedTemporaryFile(delete=False)
    try:
        data = await file.read()
        with temp as f:
            f.write(data)
    except Exception:
        return {"message": "There was an error uploading the file"}
    finally:
        file.close()
    video = VideoFileClip(temp.name)
    lf = loopFinder(video)
    gifs = lf.process_clip()

    os.remove(temp.name)
    return {"gifs": gifs}
