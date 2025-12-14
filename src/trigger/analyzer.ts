import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";

export const analyzeThreadTask = task({
  id: "analyze-thread",
  run: async (payload: { userId: string; threadId: string }) => {
    const { userId, threadId } = payload;

    console.log(`Starting full pipeline for thread ${threadId} (user: ${userId})`);

    try {
      // Step 1: Process Entities (extract participants, create/link companies and customers)
      console.log(`Step 1: Processing entities for thread ${threadId}`);
      const processorResult = await python.runScript(
        "backend/services/processor.py",
        [userId, threadId]
      );

      console.log("Entity processor stdout:", processorResult.stdout);
      if (processorResult.stderr) {
        console.error("Entity processor stderr:", processorResult.stderr);
      }

      // Check if processor succeeded
      try {
        const processorData = JSON.parse(processorResult.stdout || "{}");
        if (!processorData.success) {
          throw new Error(
            `Entity processing failed: ${JSON.stringify(processorData.errors || [])}`
          );
        }
        console.log(
          `Entity processing completed: ${processorData.companies_created || 0} companies created, ${processorData.customers_created || 0} customers created`
        );
      } catch (parseError) {
        // If stdout is not JSON, check exit code
        if (processorResult.exitCode !== 0) {
          throw new Error(
            `Entity processing failed with exit code ${processorResult.exitCode}`
          );
        }
      }

      // Step 2: Analyze Thread (AI analysis)
      console.log(`Step 2: Analyzing thread ${threadId}`);
      const analyzerResult = await python.runScript("backend/services/analyzer.py", [
        userId,
        threadId,
      ]);

      console.log("Thread analyzer stdout:", analyzerResult.stdout);
      if (analyzerResult.stderr) {
        console.error("Thread analyzer stderr:", analyzerResult.stderr);
      }

      // Check if analyzer succeeded
      try {
        const analyzerData = JSON.parse(analyzerResult.stdout || "{}");
        if (!analyzerData.success) {
          throw new Error(
            `Thread analysis failed: ${JSON.stringify(analyzerData.errors || [])}`
          );
        }
      } catch (parseError) {
        // If stdout is not JSON, check exit code
        if (analyzerResult.exitCode !== 0) {
          throw new Error(
            `Thread analysis failed with exit code ${analyzerResult.exitCode}`
          );
        }
      }

      return {
        success: true,
        processor: {
          stdout: processorResult.stdout,
          stderr: processorResult.stderr,
          exitCode: processorResult.exitCode,
        },
        analyzer: {
          stdout: analyzerResult.stdout,
          stderr: analyzerResult.stderr,
          exitCode: analyzerResult.exitCode,
        },
      };
    } catch (error) {
      console.error("Error executing pipeline:", error);
      throw error;
    }
  },
});

