export interface FieldLabelProps {
  text: string
}

export function FieldLabel({ text }: FieldLabelProps) {
  return <label className="field-label">{text}</label>
}

export default FieldLabel
