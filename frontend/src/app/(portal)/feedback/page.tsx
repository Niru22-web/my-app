"use client";

import { MessageSquareHeart } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackHeader, MyFeedbackList } from "@/components/feedback/my-feedback";

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <FeedbackHeader />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="h-fit">
          <CardHeader icon={MessageSquareHeart} title="Send feedback" description="Ideas, problems, praise or questions — all welcome." />
          <div className="p-5">
            <FeedbackForm pageUrl="/feedback" />
          </div>
        </Card>
        <section aria-labelledby="my-feedback-title" className="space-y-3">
          <h3 id="my-feedback-title" className="font-display text-[15px] font-bold text-ink">
            Your feedback
          </h3>
          <MyFeedbackList />
        </section>
      </div>
    </div>
  );
}
