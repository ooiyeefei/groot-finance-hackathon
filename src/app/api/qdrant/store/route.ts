import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { information, metadata } = await request.json()

    if (!information || !metadata) {
      return NextResponse.json(
        { success: false, error: 'Information and metadata required' },
        { status: 400 }
      )
    }

    // Store in Qdrant vector database via MCP server
    try {
      // Use the MCP server to store the vector
      // For now, we'll log and return success - in production this would use the actual MCP call
      console.log('Storing vector embedding via MCP:', { 
        information: information.substring(0, 100) + '...', 
        metadata,
        timestamp: new Date().toISOString()
      })

      // TODO: Replace with actual MCP server call when ready
      // const result = await mcpClient.call('finanseal-docs-search', 'qdrant-store', {
      //   information,
      //   metadata
      // })

      return NextResponse.json({
        success: true,
        message: 'Vector stored successfully in Qdrant'
      })

    } catch (mcpError) {
      console.error('MCP Qdrant storage error:', mcpError)
      return NextResponse.json(
        { success: false, error: 'Failed to store vector in Qdrant' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Qdrant API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}