import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import Slider from '@mui/material/Slider';
import { OnProgressProps } from 'react-player/base';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { NewtonsCradle, ThreeBody } from '@uiball/loaders'
import './App.css';

function App() {
  const minDistance = 1;
  const maxDistance = 60;
  
  const perPage = 5;

  const [loaded, setLoaded] = useState(false);

  const [running, setRun] = useState(false);
  
  const [url, setUrl] = useState('');
  const [durationRange, setDurationRange] = useState([0,0]);
  const [lengthRange, setLengthRange] = useState([0.5,10]);
  const [duration, setDuration] = useState(0);
  const [threshold, setThreshold] = useState(0.95);
  const [evaluation, setEvaluation] = useState("quality");

  const [page, setPage] = useState(1);
  const [gifs, setGifs] = useState<File[]>([]);
  const [ranges, setRanges] = useState([]);
  const [sTime, setSTime] = useState(0.0);

  const playerRef = useRef<ReactPlayer>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg>(new FFmpeg());
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

  const submitSegment = async () => {
    console.log("SUBMIT");
    setRun(true);
    setGifs([]);
    setRanges([]);
    setPage(1);
    const s = durationRange[0];
    setSTime(s);
    const ffmpeg = ffmpegRef.current;
    const start = timeStr(s);
    const len = durationRange[1] - s;
    await ffmpeg.exec(['-ss', start, '-t', len.toString(), '-i', 'input.mp4', '-c', 'copy', 'output.mp4']);
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], {"type" : "video\/mp4"})
    const file = new File([blob], 'clip.mp4', {
      type: blob.type,
    });
    console.log("Created Clip");
    if(file === null) {
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('minLen', String(lengthRange[0]));
    formData.append('maxLen', String(lengthRange[1]));
    formData.append('threshold', String(threshold));
    formData.append('eval', evaluation);
    try {
      const endpoint = "http://0.0.0.0:8000/uploadfile";
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      console.log(response);
      console.log(data);


      if(response.ok) {
        console.log("File uploaded successfully");
        setRanges(data.gifs);
        createGifs(data.gifs, s);
      }
      setRun(false);
    } catch(error) {
      console.log(error);
      setRun(false);
    }
  }

  const createGifs = async (responseList: [], startTime: number) => {
    const ffmpeg = ffmpegRef.current;
    let _gifs = [];
    for(let i = 0; i < responseList.length; i++) {
      let ss = timeStr(startTime + responseList[i][0]);
      let t = responseList[i][1];

      let fname = ss.replaceAll(":","-")+'_'+timeStr(startTime + responseList[i][1]).replaceAll(":","-")+'.gif';
      await ffmpeg.exec(['-ss', ss, '-t', String(t), '-i', 'input.mp4', fname]);
      const data = await ffmpeg.readFile(fname);
      const blob = new Blob([data], {"type" : "image\/gif"})
      const file = new File([blob], fname, {
        type: blob.type,
      });
      _gifs.push(file);
    }
    setGifs(_gifs)
  }

  const uploadFile = async (_url: string) => {
    const ffmpeg = ffmpegRef.current;
    await ffmpeg.writeFile('input.mp4', await fetchFile(_url));
  }

  const fileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files && e.target.files.length > 0) {
      let _url = URL.createObjectURL(e.target.files[0]);
      uploadFile(_url);
      setUrl(_url);
    }
  }

  const handleProgress = (state: OnProgressProps) => {
    if(state.playedSeconds >= durationRange[1]) {
      playerRef.current?.seekTo(durationRange[0] / duration);
    }
  }

  const handleDuration = (duration: number) => {
    setDurationRange([0,Math.min(30,duration)]);
    setDuration(duration);
  }

  const handleDurationChange = (
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
        setDurationRange([minRange, Math.min(newValue[1], newValue[0] + maxDistance)]);
      } else {
        minRange = Math.max(newValue[0], newValue[1] - maxDistance);
        setDurationRange([minRange, newValue[1]]);
      }
    } else if (newValue[1] - newValue[0] < minDistance) {
      if (activeThumb === 0) {
        minRange = Math.min(newValue[0], duration - minDistance);
        setDurationRange([minRange, minRange + minDistance]);
      } else {
        const clamped = Math.max(newValue[1], minDistance);
        minRange = clamped - minDistance;
        setDurationRange([minRange, clamped]);
      }
    } else {
      minRange = newValue[0];
      setDurationRange(newValue as number[]);
    }
    playerRef.current?.seekTo(minRange / duration);
  };

  const handleLengthChange = (
    event: Event,
    newValue: number | number[],
    activeThumb: number,
  ) => {
    if (!Array.isArray(newValue)) {
      return;
    }

    let minRange = 0.5;
    let minDist = 0.5;
    let maxDist = 60;
    if (newValue[1] - newValue[0] < minDist) {
      if (activeThumb === 0) {
        minRange = Math.min(newValue[0], maxDist - minDist);
        setLengthRange([minRange, minRange + minDist]);
      } else {
        const clamped = Math.max(newValue[1], minDist);
        minRange = clamped - minDist;
        setLengthRange([minRange, clamped]);
      }
    } else {
      minRange = newValue[0];
      setLengthRange(newValue as number[]);
    }
  };

  const createGifList = () => {
    if(running) {
      return (
        <div className='h-full flex items-center justify-center'>
          <NewtonsCradle/>
        </div>
      );
    }

    if(gifs.length == 0) {
      return;
    }

    return <ul className='h-full w-full'>
        {gifs.map((item, idx) => {
          return (
            <li className={'h-[19.5vh] w-[40vw] pt-3 pb-3 ' + (((idx % 2) === 0) ? 'bg-slate-400' : 'bg-slate-600')} key={item.name}>
              <div className='h-full w-full flex justify-between'>
                <img className='h-[18wh] w-[32vh] mt-auto mb-auto ml-2' src={URL.createObjectURL(item)}/>
                <div className='mt-auto mb-auto text-l'>{item.name}</div>
                <a className='mt-auto mb-auto' href={URL.createObjectURL(item)} download={item.name} target='_blank'>
                  <input className='h-[4rem] w-[6rem] mt-auto mb-auto mr-2 text-xl bg-violet-600' type='button' value="Download"/>
                </a>
              </div>
            </li>
          );
        })}
        <div className="table flex-row w-full h-[2.5vh] text-center">
          <input className="table-cell w-1/3 ml-4 h-full" type="button" value="Previous Page" disabled={page == 1} onClick={(e) => setPage(page - 1)}/>
          <div>
            Page {page} of {Math.ceil(ranges.length / perPage)}
          </div>
          <input className="table-cell w-1/3 ml-4 h-full" type="button" value="Next Page" disabled={page == Math.ceil(ranges.length / perPage)} onClick={(e) => setPage(page + 1)}/>
        </div>
      </ul>;
  }

  return loaded ? (
    <div className="justify-center justify-items-center h-screen w-full overscroll-none">
      
      <div className="grid float-left justify-center justify-items-center align-middle w-3/5 h-full bg-slate-300">
        <div className="flex w-[40vw] h-[22.5vw] mt-10 justify-center items-center">
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
            <div className='w-full h-full bg-black'/>
          }
        </div>

        <div className="flex-row w-4/5 h-1/6 text-center">
          <div className="table w-full">
            <input className="invisible w-0 h-0" ref={uploadRef} type="file" accept=".mp4" onChange={(e) => fileSelect(e)}/>
            <input className="table-cell w-1/3 mr-4 h-auto text-white bg-blue-600" type="button" value="Browse..." disabled={running} onClick={() => uploadRef.current?.click()}/>
            <input className="table-cell w-1/3 ml-4 h-auto text-white bg-green-500" type="button" value="Submit" disabled={running || url == ''} onClick={submitSegment}/>
          </div>
        </div>

        <div className="w-10/12 mt-5 justify-center items-center">
          <div className="w-full">
            <Slider
              getAriaLabel={() => 'Minimum distance'}
              value={durationRange}
              min={0}
              max={duration}
              step={1}
              onChange={handleDurationChange}
              valueLabelDisplay="auto"
              disabled={running}
              disableSwap
            />
          </div>

          <div className="flex justify-between">
            <div className='text-2xl'>
              {timeStr(durationRange[0])}
            </div>
            <div className='text-2xl'>
              {timeStr(durationRange[1])}
            </div>
          </div>
        </div>
        
        <div className="w-10/12 mt-5 justify-center items-center">
          <div className="w-full">
            <Slider
              getAriaLabel={() => 'Minimum distance'}
              value={lengthRange}
              min={0.5}
              max={60}
              step={0.5}
              onChange={handleLengthChange}
              valueLabelDisplay="auto"
              disabled={running}
              disableSwap
            />
          </div>

          <div className="flex justify-between">
            <div className='text-2xl'>
              {lengthRange[0]}
            </div>
            <div className='text-2xl'>
              {lengthRange[1]}
            </div>
          </div>
        </div>

        <div className="table justify-center text-xl pt-4">
          <div className="table-cell pr-2">
            Threshold set to {threshold}:
          </div>
          <input className="table-cell border" type="range" max={1} min={0.85} step={0.01} value={threshold} disabled={running} onChange={(e) => setThreshold(parseFloat(e.target.value))}/>
        </div>

        <div className="table justify-center text-xl pt-4">
          <div className="table-cell pr-8">Create matches based on:</div>
            <label className="table-cell pr-8">
              <input className="border mr-2" type="radio" value={"quality"} checked={evaluation=="quality"} disabled={running} onChange={(e) => setEvaluation(e.target.value)} />
              Prioritize Better Looping Gifs
            </label>
            <label className="table-cell pr-8">
              <input className="border mr-2" type="radio" value={"length"} checked={evaluation=="length"} disabled={running} onChange={(e) => setEvaluation(e.target.value)} />
              Prioritize Long Gifs
            </label>
        </div>
      </div>
        

      <div className="grid float-right w-2/5 h-full justify-center justify-items-center overflow-scroll bg-slate-500">
        { createGifList() }
      </div>

    </div>
  ) : (
    <div className='h-screen flex items-center justify-center bg-slate-300'>
      <ThreeBody/>
    </div>
  )
}

export default App
