import { Card } from "@/components/ui/card"

interface ExamplePromptsProps {
  onPromptSelect: (prompt: string) => void
}

const EXAMPLE_PROMPTS = [
  {
    title: '🎯 Chấm điểm mức độ phù hợp của CV với JD',
  },
  {
    title: '🎙️ Bắt đầu buổi phỏng vấn kỹ thuật thử',
  },
  {
    title: '💡 Gợi ý viết lại kinh nghiệm trong CV bằng tiếng Anh',
  },
  {
    title: '🔍 Tóm tắt các điểm mạnh và công nghệ nổi bật trong CV',
  },
];

export function ExamplePrompts({ onPromptSelect }: ExamplePromptsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
      {EXAMPLE_PROMPTS.map((prompt, i) => (
        <Card 
          key={i} 
          className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => onPromptSelect(prompt.title)}
        >
          <p className="text-sm text-center font-medium">{prompt.title}</p>
        </Card>
      ))}
    </div>
  )
}

