import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from 'conduct/ui';

export default function ReadingRoom() {
  const [saved, setSaved] = useState(false);
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8 md:p-12">
      <header className="space-y-5">
        <Badge variant="secondary">A working proposal</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Make room for the work.
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          A quieter workspace starts with a simple idea: give people the context they need, then
          give them a little room to think.
        </p>
      </header>
      <Tabs defaultValue="proposal" className="gap-6">
        <TabsList aria-label="Proposal sections">
          <TabsTrigger value="proposal">The proposal</TabsTrigger>
          <TabsTrigger value="changes">What changes</TabsTrigger>
        </TabsList>
        <TabsContent value="proposal">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>A clear starting point</CardTitle>
              <CardDescription>Less searching. More time with the idea itself.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 leading-relaxed">
              <p>Bring the brief, the open questions, and the latest thinking into one place.</p>
              <p>Review a small piece of work together before deciding what deserves more time.</p>
            </CardContent>
            <CardFooter>
              <Button variant={saved ? 'secondary' : 'default'} onClick={() => setSaved(!saved)}>
                {saved ? 'Added to the discussion' : 'Add to the discussion'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="changes">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>One considered step at a time</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 leading-relaxed">
              <p>Start each project with a short brief that explains the intended outcome.</p>
              <p>
                Keep decisions beside the work, so the next person can understand the reasoning.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Accordion type="single" collapsible>
        <AccordionItem value="learning">
          <AccordionTrigger>What should we learn first?</AccordionTrigger>
          <AccordionContent className="leading-relaxed text-muted-foreground">
            Whether a short, shared brief helps a team make its next decision with more confidence.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">A question to take forward</h2>
        <label className="block space-y-2 text-sm">
          <span>Topic</span>
          <Input placeholder="What deserves a closer look?" />
        </label>
        <label className="block space-y-2 text-sm">
          <span>Context</span>
          <Textarea placeholder="A little background for the conversation…" />
        </label>
      </section>
    </main>
  );
}
