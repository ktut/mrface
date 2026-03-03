import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

type Vec3 = [number, number, number];

export interface HomeAttachmentTransform {
  offset: Vec3;
  rotation: Vec3;
  scale: number;
}

interface HomeDebugPanelProps {
  onChangeAttachment: (t: HomeAttachmentTransform) => void;
  onChangeBody: (t: HomeAttachmentTransform) => void;
}

export function HomeDebugPanel({ onChangeAttachment, onChangeBody }: HomeDebugPanelProps) {
  const { selectedGameId } = useApp();
  const gameId = (selectedGameId ?? 'waterpark') as 'cart' | 'waterpark';

  const zero: HomeAttachmentTransform = useMemo(
    () => ({ offset: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }),
    [],
  );

  const [attachment, setAttachment] = useState<HomeAttachmentTransform>(zero);
  const [body, setBody] = useState<HomeAttachmentTransform>(zero);

  // On game change, reset sliders to zero-delta; SceneManager already applies HOME / BODY_HOME.
  useEffect(() => {
    setAttachment(zero);
    setBody(zero);
    onChangeAttachment(zero);
    onChangeBody(zero);
  }, [gameId, zero, onChangeAttachment, onChangeBody]);

  const bumpAttachment = (next: HomeAttachmentTransform) => {
    setAttachment(next);
    onChangeAttachment(next);
  };

  const bumpBody = (next: HomeAttachmentTransform) => {
    setBody(next);
    onChangeBody(next);
  };

  const updateVec3 = (
    target: 'attachment' | 'body',
    key: 'offset' | 'rotation',
    index: 0 | 1 | 2,
    value: number,
  ) => {
    const current = target === 'attachment' ? attachment : body;
    const next: HomeAttachmentTransform = {
      ...current,
      [key]: current[key].map((n, i) => (i === index ? value : n)) as Vec3,
    };
    if (target === 'attachment') bumpAttachment(next);
    else bumpBody(next);
  };

  const slider = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min: number,
    max: number,
    step: number,
  ) => (
    <label key={label} className="home-debug-row">
      <span className="home-debug-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="home-debug-val">{value.toFixed(3)}</span>
    </label>
  );

  const json =
    gameId === 'cart'
      ? {
          KART_HOME_OFFSET: attachment.offset,
          KART_HOME_ROTATION: attachment.rotation,
          KART_HOME_SCALE: attachment.scale,
          KART_BODY_OFFSET: body.offset,
          KART_BODY_ROTATION: body.rotation,
          KART_BODY_SCALE: body.scale,
        }
      : {
          WATERPARK_HOME_OFFSET: attachment.offset,
          WATERPARK_HOME_ROTATION: attachment.rotation,
          WATERPARK_HOME_SCALE: attachment.scale,
          WATERPARK_BODY_OFFSET: body.offset,
          WATERPARK_BODY_ROTATION: body.rotation,
          WATERPARK_BODY_SCALE: body.scale,
        };

  const valueText = JSON.stringify(json, null, 2);

  return (
    <div className="home-debug-panel">
      <h3 className="home-debug-title">
        Debug: {gameId === 'cart' ? 'Kart' : 'Waterpark'} layout
      </h3>

      <div className="home-debug-section">
        <strong>Attachment offset (x, y, z)</strong>
        {(['x', 'y', 'z'] as const).map((axis, i) =>
          slider(
            axis,
            attachment.offset[i],
            (v) => updateVec3('attachment', 'offset', i as 0 | 1 | 2, v),
            axis === 'y' ? -1.5 : -1.0,
            axis === 'y' ? 1.0 : 1.0,
            0.01,
          ),
        )}
      </div>

      <div className="home-debug-section">
        <strong>Attachment rotation (rad)</strong>
        {(['x', 'y', 'z'] as const).map((axis, i) =>
          slider(
            axis,
            attachment.rotation[i],
            (v) => updateVec3('attachment', 'rotation', i as 0 | 1 | 2, v),
            -Math.PI,
            Math.PI,
            0.01,
          ),
        )}
      </div>

      <div className="home-debug-section">
        <strong>Attachment scale</strong>
        {slider('s', attachment.scale, (v) => bumpAttachment({ ...attachment, scale: v }), 0.5, 1.5, 0.01)}
      </div>

      <div className="home-debug-section">
        <strong>Body offset (x, y, z)</strong>
        {(['x', 'y', 'z'] as const).map((axis, i) =>
          slider(
            axis,
            body.offset[i],
            (v) => updateVec3('body', 'offset', i as 0 | 1 | 2, v),
            axis === 'y' ? -1.0 : -0.6,
            axis === 'y' ? 1.0 : 0.6,
            0.01,
          ),
        )}
      </div>

      <div className="home-debug-section">
        <strong>Body rotation (rad)</strong>
        {(['x', 'y', 'z'] as const).map((axis, i) =>
          slider(
            axis,
            body.rotation[i],
            (v) => updateVec3('body', 'rotation', i as 0 | 1 | 2, v),
            -Math.PI,
            Math.PI,
            0.01,
          ),
        )}
      </div>

      <div className="home-debug-section">
        <strong>Body scale</strong>
        {slider('s', body.scale, (v) => bumpBody({ ...body, scale: v }), 0.5, 1.5, 0.01)}
      </div>

      <div className="home-debug-section">
        <strong>Copy JSON</strong>
        <textarea
          readOnly
          rows={14}
          className="home-debug-textarea"
          value={valueText}
        />
      </div>
    </div>
  );
}

