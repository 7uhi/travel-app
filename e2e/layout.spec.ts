import { expect, test } from "./fixtures";
import { TRIP } from "./seed";

test.use({ signedInAs: "owner" });

for (const path of ["/", "/trips", `/trips/${TRIP.id}`, `/trips/${TRIP.id}/expenses`]) {
  test(`${path} fits the viewport without horizontal scrolling`, async ({ page }) => {
    await page.goto(path);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}
