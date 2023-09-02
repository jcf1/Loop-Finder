import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import Slider from '@mui/material/Slider';
import { OnProgressProps } from 'react-player/base';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { saveAs } from 'file-saver';

function App() {
  const minDistance = 1;
  const maxDistance = 60;

  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState('');
  const [range, setRange] = useState([0,0]);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef<ReactPlayer>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef(new FFmpeg());
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.2/dist/esm";
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("log", ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
    });
    // toBlobURL is used to bypass CORS issue, urls with the same
    // domain can be used directly.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
      workerURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.worker.js`,
        "text/javascript"
      ),
    });
    setLoaded(true);
  };
  
  const timeStr = (seconds: number) => {
    let minutes = seconds / 60;
    let hours = Math.floor(minutes / 60);
    minutes = Math.floor(minutes % 60);
    seconds = Math.floor(seconds % 60);
    return String(hours) + ":" + String(minutes).padStart(2,'0') + ":" + String(seconds).padStart(2,'0');
  }

  const clipSegment = async () => {
    const ffmpeg = ffmpegRef.current;
    const start = timeStr(range[0]);
    const len = range[1] - range[0];
    await ffmpeg.writeFile('input.mp4', await fetchFile(url));
    await ffmpeg.exec(['-ss', start, '-i', 'input.mp4', '-t', len.toString(), 'output.mp4']);
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], {"type" : "video\/mp4"})
    saveAs(blob, "test.mp4");    
  }

  const fileTest = (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files) {
      setUrl(URL.createObjectURL(e.target.files[0]));
    }
  }

  const handleProgress = (state: OnProgressProps) => {
    if(state.playedSeconds >= range[1]) {
      playerRef.current?.seekTo(range[0] / duration);
    }
  }

  const handleDuration = (duration: number) => {
    setRange([0,Math.min(30,duration)]);
    setDuration(duration);
  }

  const handleRangeChange = (
    event: Event,
    newValue: number | number[],
    activeThumb: number,
  ) => {
    if (!Array.isArray(newValue)) {
      return;
    }

    let minRange = 0;
    if (newValue[1] - newValue[0] > maxDistance) {
      if (activeThumb === 0) {
        minRange = newValue[0];
        setRange([minRange, Math.min(newValue[1], newValue[0] + maxDistance)]);
      } else {
        minRange = Math.max(newValue[0], newValue[1] - maxDistance);
        setRange([minRange, newValue[1]]);
      }
    } else if (newValue[1] - newValue[0] < minDistance) {
      if (activeThumb === 0) {
        minRange = Math.min(newValue[0], duration - minDistance);
        setRange([minRange, minRange + minDistance]);
      } else {
        const clamped = Math.max(newValue[1], minDistance);
        minRange = clamped - minDistance;
        setRange([minRange, clamped]);
      }
    } else {
      minRange = newValue[0];
      setRange(newValue as number[]);
    }
    playerRef.current?.seekTo(minRange / duration);
  };

  return loaded ? (
    <div className="grid justify-center justify-items-center h-full w-full">

      <div className="flex w-4/5 h-auto justify-center items-center">
        {url ? 
          <ReactPlayer
            ref={playerRef}
            width='100%'
            height='100%'
            playing={true}
            muted={true}
            onDuration={handleDuration}
            url={url}
            onProgress={handleProgress}
          />
          :
          <div className="w-full h-full bg-black"/>
        }
      </div>

      <div className="w-full justify-center items-center">
        <Slider
          getAriaLabel={() => 'Minimum distance'}
          value={range}
          min={0}
          max={duration}
          step={1}
          onChange={handleRangeChange}
          valueLabelDisplay="auto"
          disableSwap
        />
      </div>

      <div className="flex w-full justify-between">
        <div className='text-2xl'>
          {timeStr(range[0])}
        </div>
        <div className='text-2xl'>
          {timeStr(range[1])}
        </div>
      </div>

      <input className="invisible" ref={uploadRef} type="file" accept=".mp4" onChange={(e) => fileTest(e)}/>
      <input className="w-4/5 h-auto text-white bg-blue-600" type="button" value="Browse..." onClick={() => uploadRef.current?.click()}/>

      <input className="w-4/5 h-auto text-white bg-red-500" type="button" value="Clip" onClick={clipSegment}/>
    </div>
  ) : (
    <div>
      LOADING
    </div>
  )
}

export default App
