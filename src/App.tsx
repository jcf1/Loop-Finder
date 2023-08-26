import { useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import Slider from '@mui/material/Slider';
import { OnProgressProps } from 'react-player/base';

function App() {
  const minDistance = 1;
  const maxDistance = 60;

  const [url, setUrl] = useState('');
  const [range, setRange] = useState([0,0]);
  const [duration, setDuration] = useState(0);
  const [played, setPlayed] = useState(0.0);

  const playerRef = useRef<ReactPlayer>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  
  const timeStr = (seconds: number) => {
    let minutes = seconds / 60;
    let hours = Math.floor(minutes / 60);
    minutes = Math.floor(minutes % 60);
    seconds = Math.floor(seconds % 60);
    return String(hours) + ":" + String(minutes).padStart(2,'0') + ":" + String(seconds).padStart(2,'0');
  }

  const fileTest = (e: React.ChangeEvent<HTMLInputElement>) => {
    if(e.target.files) {
      setUrl(URL.createObjectURL(e.target.files[0]));
    }
  }

  const handleProgress = (state: OnProgressProps) => {
    //console.log(playedSeconds)
    if(state.playedSeconds >= range[1]) {
      playerRef.current?.seekTo(range[0] / duration);
    }
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
    } else {
      minRange = newValue[0];
      setRange(newValue as number[]);
    }
    playerRef.current?.seekTo(minRange / duration);
  };

  const handleRangeChange2 = (
      event: Event,
      newValue: number | number[],
      activeThumb: number,
    ) => {
      if (!Array.isArray(newValue)) {
        return;
      }

      let minRange = 0;
      if (activeThumb === 0) {
        minRange = Math.min(newValue[0], range[1] - minDistance);
        setRange([Math.max(minRange, range[1] - maxDistance), range[1]]);
      } else {
        minRange = range[0];
        setRange([minRange, Math.min(Math.max(newValue[1], range[0] + minDistance), range[0] + maxDistance)]);
      }

      playerRef.current?.seekTo(minRange / duration);
  };

  return (
    <div className="grid justify-center justify-items-center h-full w-full">

      <div className="flex w-2/3 h-auto justify-center items-center">
        {url ? 
          <ReactPlayer
            ref={playerRef}
            width='100%'
            height='100%'
            playing={true}
            muted={true}
            played={played}
            onDuration={setDuration}
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

      <input className="is-hidden" ref={uploadRef} type="file" accept=".mp4" onChange={(e) => fileTest(e)}/>
      <input type="button" value="Browse..." onClick={() => uploadRef.current?.click()}/>
    </div>
  )
}

export default App