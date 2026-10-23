import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('AI Resume Matcher & Interview Coach E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock LangGraph threads creation
    await page.route('**/threads', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ thread_id: 'mock_thread_123' }),
      });
    });

    // Mock /api/ingest for isolated and fast file upload testing
    await page.route('**/api/ingest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, count: 1 }),
      });
    });

    // Navigate to homepage
    await page.goto('/');
    // Wait for the main heading to be visible
    await expect(
      page.getByRole('heading', { name: 'AI Resume Matcher & Interview Coach' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('TC01: Verify initial page elements and branding', async ({ page }) => {
    // Verify Header Branding
    await expect(
      page.getByText('Powered by Google Gemini 3.8 Flash & LangGraph'),
    ).toBeVisible();

    // Verify Session ID badge is generated and rendered with sess_ prefix
    const sessionBadge = page.locator('header span.font-mono');
    await expect(sessionBadge).toBeVisible();
    await expect(sessionBadge).toContainText('sess_', { timeout: 10000 });

    // Verify Welcome Hero
    await expect(
      page.getByText('Sẵn sàng cho kỳ phỏng vấn tiếp theo'),
    ).toBeVisible();

    // Verify Action Buttons
    await expect(
      page.getByRole('button', { name: 'Chấm điểm CV với JD' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Phỏng vấn Kỹ thuật Thử' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Dán JD', exact: true }),
    ).toBeVisible();

    // Verify Chat Input
    await expect(
      page.getByPlaceholder(/Tải lên CV .* hoặc gõ tin nhắn/i),
    ).toBeVisible();
  });

  test('TC02: Job Description (JD) drawer toggling and text input', async ({
    page,
  }) => {
    // Click JD drawer button to open
    const jdButton = page.getByRole('button', { name: 'Dán JD', exact: true });
    await jdButton.click();

    // Verify Textarea is displayed
    const jdTextarea = page.getByPlaceholder(
      /Dán nội dung Job Description \(JD\)/i,
    );
    await expect(jdTextarea).toBeVisible({ timeout: 10000 });

    // Fill in Job Description
    const sampleJd =
      'Tuyển dụng Frontend Engineer: Yêu cầu thành thạo Next.js, React, TypeScript, Tailwind CSS, và biết viết kiểm thử tự động với Playwright.';
    await jdTextarea.fill(sampleJd);

    // Verify drawer header shows word count
    await expect(
      page.getByText('Bản mô tả công việc (Job Description - JD)'),
    ).toBeVisible();

    // Close JD drawer
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(jdTextarea).not.toBeVisible();

    // Verify button text now indicates JD is filled with word count
    await expect(
      page.getByRole('button', { name: /JD \(\d+ từ\)/i }),
    ).toBeVisible();
  });

  test('TC03: Upload CV PDF and verify file preview', async ({ page }) => {
    const samplePdfPath = path.join(__dirname, 'fixtures', 'sample_resume.pdf');

    // Attach file directly to the file input
    const fileInput = page.locator('input[type="file"][accept=".pdf"]');
    await fileInput.setInputFiles(samplePdfPath);

    // Verify the file preview chip is rendered inside the preview list
    const fileChip = page
      .getByTestId('file-preview-list')
      .getByText('sample_resume.pdf');
    await expect(fileChip).toBeVisible({ timeout: 10000 });

    // Verify Remove file button works
    const removeButton = page.getByLabel('Xóa file sample_resume.pdf');
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Verify file preview list is removed
    await expect(page.getByTestId('file-preview-list')).not.toBeVisible();
  });

  test('TC04: Send conversational query and receive AI stream response', async ({
    page,
  }) => {
    // Intercept SSE streaming response from /api/chat for fast, deterministic E2E validation
    await page.route('**/api/chat', async (route) => {
      const ssePayload = [
        `data: ${JSON.stringify({
          event: 'messages/partial',
          data: [
            {
              type: 'ai',
              content:
                'Chào bạn! Tôi là AI Resume Matcher & Interview Coach. Lời khuyên phỏng vấn: Hãy nắm vững kiến trúc các dự án trong CV và luôn nêu rõ Trade-off khi chọn công nghệ.',
            },
          ],
        })}\n\n`,
      ].join('');

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
        body: ssePayload,
      });
    });

    const inputField = page.getByPlaceholder(
      /Tải lên CV .* hoặc gõ tin nhắn/i,
    );
    await inputField.fill('Xin chào AI! Bạn hãy cho tôi một lời khuyên phỏng vấn.');

    // Wait for submit button to be enabled (threadId initialized)
    const submitBtn = page.locator('form button[type="submit"]');
    await expect(submitBtn).toBeEnabled({ timeout: 15000 });
    await submitBtn.click();

    // Verify User message bubble appears in chat
    await expect(page.getByTestId('user-message')).toBeVisible();
    await expect(page.getByTestId('user-message')).toContainText(
      'Xin chào AI! Bạn hãy cho tôi một lời khuyên phỏng vấn.',
    );

    // Wait for AI response to stream back
    const assistantMessage = page.getByTestId('assistant-message');
    await expect(assistantMessage).toBeVisible({ timeout: 10000 });

    // Verify that response is visible and contains expected content
    await expect(assistantMessage).toContainText(
      'AI Resume Matcher & Interview Coach',
    );
    await expect(assistantMessage).toContainText(
      'Lời khuyên phỏng vấn: Hãy nắm vững kiến trúc các dự án trong CV',
    );
  });
});
