import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import Slider from '@mui/material/Slider';
import { OnProgressProps } from 'react-player/base';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { NewtonsCradle, ThreeBody, Waveform } from '@uiball/loaders'
import { IconContext } from "react-icons";
import { BiDownload } from "react-icons/bi";
import './App.css';

function App() {

  const endpoint = 'https://loopfinder-server-swfjocc4vq-uk.a.run.app';

  //Video Selection
  const minDuration = 1;
  const maxDuration = 30;

  //Gif Settings
  const minLength = 0.25;
  const maxLength = 10;
  const lengthStep = 0.25;
  const minThreshold = 0.75;
  const maxThreshold = 1.0;
  
  const perPage = 5;

  const [loaded, setLoaded] = useState(false);
  const [running, setRun] = useState(false);
  const [ran, setRan] = useState(false);
  const [error,setError] = useState(false);
  
  const [url, setUrl] = useState('');
  const [durationRange, setDurationRange] = useState([0,0]);
  const [lengthRange, setLengthRange] = useState([0.25,5]);
  const [duration, setDuration] = useState(0);
  const [threshold, setThreshold] = useState(0.75);
  const [evaluation, setEvaluation] = useState("quality");

  const [page, setPage] = useState(1);
  const [ranges, setRanges] = useState([]);
  const [sTime, setSTime] = useState(0.0);
  const [gifs, setGifs] = useState<File[]>([]);
  const [gifInfo, setGifInfo] = useState<string[][]>([]);
  const [loadGifs, setLoadGifs] = useState(false);

  const playerRef = useRef<ReactPlayer>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg>(new FFmpeg());
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  //Initial load
  useEffect(() => {
    load();
  }, []);

  //When results page changes
  useEffect(() => {
    if(ranges.length > 0 && !loadGifs) {
      setLoadGifs(true);
      setGifs([]);
      createGifs().then((result) => {
        setGifs(result[0]);
        setGifInfo(result[1]);
        setLoadGifs(false);
      });
    }
  }, [page,ranges]);

  //Time to string functions
  const timeStr = (seconds: number) => {
    let minutes = seconds / 60;
    let hours = Math.floor(minutes / 60);
    minutes = Math.floor(minutes % 60);
    seconds = Math.floor(seconds % 60);
    return String(hours) + ":" + String(minutes).padStart(2,'0') + ":" + String(seconds).padStart(2,'0');
  }

  const fullTimeStr = (seconds: number, sep: string) => {
    let milli = Math.round((seconds % 1) * 100);
    seconds = Math.floor(seconds);
    let minutes = seconds / 60;
    let hours = Math.floor(minutes / 60);
    minutes = Math.floor(minutes % 60);
    seconds = Math.floor(seconds % 60);
    return String(hours) + sep + String(minutes).padStart(2,'0') + sep + String(seconds).padStart(2,'0') + "." + String(milli).padStart(2,'0');
  }
  
  //Load in ffmpeg
  const load = async () => {
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/esm";
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on("log", ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      )
    });
    setLoaded(true);
  };

  const submitSegment = async () => {
    setRun(true);
    setError(false);
    setRanges([]);
    setGifs([]);
    setPage(1);
    setRan(true);
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
      const response = await fetch(`${endpoint}/findloop`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if(response.ok) {
        setRanges(data.gifs);
      }
      setRun(false);
    } catch(error) {
      setError(true);
      setRun(false);
    }
  }

  /*
  * ================ Handle Video Input ================
  */

  const fileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files && e.target.files.length > 0) {
      let _url = URL.createObjectURL(e.target.files[0]);
      if(await uploadFile(_url)) {
        setUrl(_url);
      }
    }
  }

  const uploadFile = async (_url: string) => {
    try {
      const ffmpeg = ffmpegRef.current;
      const video = await fetchFile(_url);
      await ffmpeg.writeFile('input.mp4', video);
    } catch(error) {
      alert("There was an issue loading your video file. Please try another one.");
      return false;
    }
    return true;
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
    if (newValue[1] - newValue[0] > maxDuration) {
      if (activeThumb === 0) {
        minRange = newValue[0];
        setDurationRange([minRange, Math.min(newValue[1], newValue[0] + maxDuration)]);
      } else {
        minRange = Math.max(newValue[0], newValue[1] - maxDuration);
        setDurationRange([minRange, newValue[1]]);
      }
    } else if (newValue[1] - newValue[0] < minDuration) {
      if (activeThumb === 0) {
        minRange = Math.min(newValue[0], duration - minDuration);
        setDurationRange([minRange, minRange + minDuration]);
      } else {
        const clamped = Math.max(newValue[1], minDuration);
        minRange = clamped - minDuration;
        setDurationRange([minRange, clamped]);
      }
    } else {
      minRange = newValue[0];
      setDurationRange(newValue as number[]);
    }
    playerRef.current?.seekTo(minRange / duration);
  };
  //====================================================

  //Handle Gif length input
  const handleLengthChange = (
    event: Event,
    newValue: number | number[],
    activeThumb: number,
  ) => {
    if (!Array.isArray(newValue)) {
      return;
    }

    let minRange = 0.25;
    if (newValue[1] - newValue[0] < minLength) {
      if (activeThumb === 0) {
        minRange = Math.min(newValue[0], maxLength - lengthStep);
        setLengthRange([minRange, minRange + minLength]);
      } else {
        const clamped = Math.max(newValue[1], minRange + minLength);
        minRange = clamped - minLength;
        setLengthRange([minRange, clamped]);
      }
    } else {
      minRange = newValue[0];
      setLengthRange(newValue as number[]);
    }
  };

  /*
  * ================ Generate and Display Results ================
  */

  const createGifs = async (): Promise<[File[], string[][]]> => {
    const ffmpeg = ffmpegRef.current;
    let _gifs = [];
    let _gifs_info = [];

    let sIdx = (page - 1) * perPage;
    let eIdx = page * perPage;
    eIdx = eIdx > ranges.length ? ranges.length : eIdx;

    for(let i = sIdx; i < eIdx; i++) {
      let ss = timeStr(sTime + ranges[i][0]);
      let t = ranges[i][1];
      let fname = fullTimeStr(sTime + ranges[i][0], ".")+'_'+fullTimeStr(sTime + ranges[i][0]+ ranges[i][1], ".")+'.gif';

      await ffmpeg.exec(['-ss', ss, '-t', String(t), '-i', 'input.mp4', fname]);
      const data = await ffmpeg.readFile(fname);
      const blob = new Blob([data], {"type" : "image\/gif"})
      const file = new File([blob], fname, {
        type: blob.type,
      });
      _gifs.push(file);
      _gifs_info.push([fullTimeStr(sTime + ranges[i][0], ":"),
                      fullTimeStr(sTime + ranges[i][0]+ ranges[i][1], ":"),
                      fullTimeStr(ranges[i][1], ":"),
                      ranges[i][2]]);
    }
    return [_gifs, _gifs_info];
  }

  const createGifList = () => {
    if(running) {
      return (
        <div className='h-full flex items-center justify-center'>
          <NewtonsCradle/>
        </div>
      );
    }

    if(error) {
      return (
        <div className='h-full w-full flex items-center justify-center text-center text-3xl text-slate-900'>
          An error occured while processing your request. Please try again.
        </div>
      );
    } else if(ranges.length == 0 && !ran) {
      return;
    }

    let pages = ranges.length == 0 ? 1 : Math.ceil(ranges.length / perPage);

    return <div className='h-full w-full'>
      <ul className='h-[95vh] w-[40vw]'>
        { ranges.length == 0 ?
          (
            <div className='h-full w-full flex items-center justify-center text-5xl text-slate-900'>
              No Results Found
            </div>
          ) : gifs.length > 0 ?
            (gifs.map((item, idx) => {
              return (
                <li className={'h-[19vh] w-[40vw] ' + (((idx % 2) === 0) ? 'bg-slate-600' : 'bg-slate-400')} key={item.name}>
                  <div className='h-full w-full flex justify-between'>
                    <div className='flex justify-center items-center h-[18vh] w-[32vh] mt-auto mb-auto ml-2'>
                      <img className='max-h-[18vh] max-w-[32vh] mt-auto mb-auto' src={URL.createObjectURL(item)}/>
                    </div>
                    <div className={'mt-auto mb-auto text-xl ' + (((idx % 2) === 0) ? 'text-slate-300' : 'text-slate-900')}>
                      <div>Score: {parseFloat(gifInfo[idx][3]).toFixed(4)}</div>
                      <div>Length: {gifInfo[idx][2]}</div>
                      <div>Start: {gifInfo[idx][0]}</div>
                      <div>End:   {gifInfo[idx][1]}</div>
                    </div>
                    <a className='mt-auto mb-auto' href={URL.createObjectURL(item)} download={item.name} target='_blank'>
                      <button className='h-[4rem] w-[6rem] mt-auto mb-auto mr-2 text-xxl'>
                        <IconContext.Provider value={{color: "white", size: "40"}}>
                          <BiDownload className='text-xxl'/>
                        </IconContext.Provider>
                      </button>
                    </a>
                  </div>
                </li>
              );
          })) : (
            <div className='h-full w-full flex items-center justify-center'>
              <Waveform/>
            </div>
          ) }
      </ul>
      <div className="table h-[5vh] w-[40vw] text-center">
        { page == 1 ? (
            <div className="table-cell w-[15vw] h-full"/>
          ) : (
            <input className="table-cell w-[15vw] h-full bg-slate-200" type="button" value="Previous Page" disabled={page == 1} onClick={(e) => {if(!loadGifs){setPage(page - 1)}}}/>
          )
        }
        <div className={"place-items-center w-[10vw] h-full items-center text-xl bg-slate-400 " + ((ranges.length == 0) ? "grid" : "table-cell")} >
          <div>
            Page {page} of {pages}
          </div>
        </div>
        { page == pages ? (
            <div className="table-cell w-[15vw] h-full"/>
          ) : (
            <input className="table-cell w-[15vw] h-full bg-slate-200" type="button" value="Next Page" disabled={page == Math.ceil(ranges.length / perPage)} onClick={(e) => {if(!loadGifs){setPage(page + 1)}}}/>
          )
        }
      </div>
    </div>;
  }
  //============================================================

  return loaded ? (
    <div className="justify-center justify-items-center h-screen w-full overscroll-none">
      
      <div className="grid w-3/5 h-full float-left justify-center justify-items-center align-middle bg-slate-300">
        <div className="grid w-full h-[95vh] float-left justify-center justify-items-center align-middle overflow-scroll scrollbar-hide">
          <div className="flex w-[40vw] h-[22.5vw] mt-10 justify-center items-center bg-black">
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
              <div className='w-full h-full'/>
            }
          </div>

          <div className="flex-row w-full h-1/6 text-center">
            <div className="table w-full">
              <input className="invisible w-0 h-0" ref={uploadRef} type="file" accept=".mp4" onChange={(e) => fileSelect(e)}/>
              <input className="table-cell w-1/3 h-[4vh] mr-20 text-white bg-blue-600" type="button" value="Browse Videos" disabled={running} onClick={() => uploadRef.current?.click()}/>
              <input className="table-cell w-1/3 h-[4vh] ml-20 text-white bg-green-600" type="button" value="Submit" disabled={running || url == ''} onClick={submitSegment}/>
            </div>
          </div>

          <div className="w-10/12 mt-5 justify-center items-center">
            <label className='justify-center text-xl'>
              Video Section:
            </label>

            <div className="w-full">
              <Slider
                getAriaLabel={() => 'Minimum distance'}
                value={durationRange}
                min={0}
                max={duration}
                step={1}
                onChange={handleDurationChange}
                valueLabelDisplay="off"
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
            <label className='justify-center text-xl'>
              Gif Min and Max Length:
            </label>
            
            <div className="w-full">
              <Slider
                getAriaLabel={() => 'Minimum distance'}
                value={lengthRange}
                min={minLength}
                max={maxLength}
                step={lengthStep}
                onChange={handleLengthChange}
                valueLabelDisplay="off"
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
              Threshold score: {(Math.round(threshold * 100) / 100).toFixed(2)}:
            </div>
            <input className="table-cell border" type="range" max={maxThreshold} min={minThreshold} step={0.01} value={threshold} disabled={running} onChange={(e) => setThreshold(parseFloat(e.target.value))}/>
          </div>

          <div className="table justify-center text-xl pt-4">
            <div className="table-cell pr-8">Create matches based on:</div>
              <label className="table-cell pr-8">
                <input className="border mr-2" type="radio" value={"quality"} checked={evaluation=="quality"} disabled={running} onChange={(e) => setEvaluation(e.target.value)} />
                Highest Score
              </label>
              <label className="table-cell pr-8">
                <input className="border mr-2" type="radio" value={"length"} checked={evaluation=="length"} disabled={running} onChange={(e) => setEvaluation(e.target.value)} />
                Length
              </label>
          </div>
        </div>

        <div className="grid w-full h-[5vh] place-items-center">
          <div className="text-sm whitespace-pre text-slate-600">
            Made by John Freeman. <a className='underline text-blue-600' href="mailto:jcf1dev@gmail.com">Contact me</a> or <a className='underline text-blue-600' href="https://jcf1.github.io/" rel="external nofollow noopener" target='_blank'>visit my website</a>.
          </div>
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
